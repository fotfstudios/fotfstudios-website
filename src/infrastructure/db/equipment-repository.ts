import type { SupabaseClient } from "@supabase/supabase-js";
import type { EquipmentDetail, EquipmentMoveRow, EquipmentRepository, EquipmentRow, Position } from "@/src/application/ports/equipment";
import type { EquiposListQuery } from "@/src/domain/admin/equipos-list";
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import {
  type EquipmentCategory,
  type EquipmentDetailsInput,
  type EquipmentInput,
  type EquipmentStatus,
  equipmentErrorMessage,
  type MoveInput,
  type PositionCatalog,
} from "@/src/domain/equipment/equipment";
import type { Database } from "./database.types";

const ROW_COLS = "id, category, brand, model, nickname, serial_number, quantity, status, location_id, resource_id, spot, updated_at";
const DETAIL_COLS = `${ROW_COLS}, purchased_at, purchase_price_clp, vendor, warranty_until, notes, created_at`;
const MOVE_COLS =
  "id, quantity, from_location_id, from_resource_id, from_spot, from_status, to_location_id, to_resource_id, to_spot, to_status, split_from_item_id, note, moved_at, moved_by";

type RawRow = {
  id: string;
  category: string;
  brand: string;
  model: string;
  nickname: string | null;
  serial_number: string | null;
  quantity: number;
  status: string;
  location_id: string;
  resource_id: string | null;
  spot: string | null;
  updated_at: string;
};
type RawDetail = RawRow & {
  purchased_at: string | null;
  purchase_price_clp: number | null;
  vendor: string | null;
  warranty_until: string | null;
  notes: string | null;
  created_at: string;
};
type RawMove = {
  id: string;
  quantity: number;
  from_location_id: string | null;
  from_resource_id: string | null;
  from_spot: string | null;
  from_status: string | null;
  to_location_id: string;
  to_resource_id: string | null;
  to_spot: string | null;
  to_status: string;
  split_from_item_id: string | null;
  note: string | null;
  moved_at: string;
  moved_by: string | null;
};

/** Nombres de sede/sala por id (incluye inactivas: un ítem viejo sigue mostrando dónde estaba). */
type Names = { locations: Map<string, string>; resources: Map<string, string> };

function throwDbError(error: { code?: string | null; message: string }): never {
  throw new Error(equipmentErrorMessage(error.code, error.message), { cause: error.message });
}

/**
 * Adapter del inventario sobre `equipment_items` / `equipment_moves` (migración
 * 20260916120000_equipment). Sin embeds PostgREST: los nombres de sede/sala se mapean en JS
 * desde un catálogo de pocas filas, así no se depende del embed por FK compuesta.
 */
export class SupabaseEquipmentRepository implements EquipmentRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private async names(): Promise<Names> {
    const [l, r] = await Promise.all([
      this.db.from("locations").select("id, name"),
      this.db.from("resources").select("id, name"),
    ]);
    if (l.error) throwDbError(l.error);
    if (r.error) throwDbError(r.error);
    return {
      locations: new Map((l.data ?? []).map((x) => [x.id, x.name])),
      resources: new Map((r.data ?? []).map((x) => [x.id, x.name])),
    };
  }

  private position(n: Names, locationId: string, resourceId: string | null, spot: string | null, status: string): Position {
    return {
      locationId,
      locationName: n.locations.get(locationId) ?? "Sede",
      resourceId,
      resourceName: resourceId ? (n.resources.get(resourceId) ?? "Sala") : null,
      spot,
      status: status as EquipmentStatus,
    };
  }

  private row(n: Names, r: RawRow): EquipmentRow {
    return {
      ...this.position(n, r.location_id, r.resource_id, r.spot, r.status),
      id: r.id,
      category: r.category as EquipmentCategory,
      brand: r.brand,
      model: r.model,
      nickname: r.nickname,
      serialNumber: r.serial_number,
      quantity: r.quantity,
      updatedAt: r.updated_at,
    };
  }

  async list(query: EquiposListQuery): Promise<{ rows: EquipmentRow[]; total: number; grandTotal: number }> {
    const from = (query.page - 1) * query.perPage;
    // escapeIlike escapa `_`/`%` y borra `,()"*` (delimitadores de la gramática de .or()).
    const needle = query.q ? escapeIlike(query.q.toLowerCase()) : "";
    const filtered = <T extends { or(f: string): T; eq(c: string, v: string): T; neq(c: string, v: string): T }>(b: T): T => {
      let x = b;
      if (needle) {
        x = x.or(`brand.ilike.%${needle}%,model.ilike.%${needle}%,nickname.ilike.%${needle}%,serial_number.ilike.%${needle}%`);
      }
      if (query.categoria) x = x.eq("category", query.categoria);
      x = query.estado === "activos" ? x.neq("status", "retired") : x.eq("status", query.estado);
      return x;
    };

    // La página de datos NO pide count: con count, un offset fuera de rango devuelve 416
    // en vez de []. Los conteos van aparte (mismo patrón que clientes).
    const [page, matching, all, n] = await Promise.all([
      filtered(this.db.from("equipment_items").select(ROW_COLS))
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + query.perPage - 1),
      filtered(this.db.from("equipment_items").select("id", { count: "exact", head: true })),
      this.db.from("equipment_items").select("id", { count: "exact", head: true }),
      this.names(),
    ]);
    if (page.error) throwDbError(page.error);
    if (matching.error) throwDbError(matching.error);
    if (all.error) throwDbError(all.error);
    return { rows: (page.data ?? []).map((r) => this.row(n, r as RawRow)), total: matching.count ?? 0, grandTotal: all.count ?? 0 };
  }

  async get(id: string): Promise<EquipmentDetail | null> {
    const [item, moves, n] = await Promise.all([
      this.db.from("equipment_items").select(DETAIL_COLS).eq("id", id).maybeSingle(),
      this.db.from("equipment_moves").select("id", { count: "exact", head: true }).eq("item_id", id),
      this.names(),
    ]);
    if (item.error) throwDbError(item.error);
    if (moves.error) throwDbError(moves.error);
    if (!item.data) return null;
    const d = item.data as RawDetail;
    return {
      ...this.row(n, d),
      purchasedAt: d.purchased_at,
      purchasePriceClp: d.purchase_price_clp,
      vendor: d.vendor,
      warrantyUntil: d.warranty_until,
      notes: d.notes,
      createdAt: d.created_at,
      moveCount: moves.count ?? 0,
    };
  }

  async history(id: string): Promise<EquipmentMoveRow[]> {
    const [moves, n] = await Promise.all([
      this.db.from("equipment_moves").select(MOVE_COLS).eq("item_id", id).order("moved_at", { ascending: false }),
      this.names(),
    ]);
    if (moves.error) throwDbError(moves.error);
    const rows = (moves.data ?? []) as RawMove[];

    const actorIds = [...new Set(rows.map((m) => m.moved_by).filter((x): x is string => !!x))];
    const emails = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data, error } = await this.db.from("admin_members").select("user_id, email").in("user_id", actorIds);
      if (error) throwDbError(error);
      for (const m of data ?? []) if (m.user_id) emails.set(m.user_id, m.email);
    }

    const pos = (locationId: string, resourceId: string | null, spot: string | null, status: string) => {
      const p = this.position(n, locationId, resourceId, spot, status);
      return { locationName: p.locationName, resourceName: p.resourceName, spot: p.spot, status: p.status };
    };
    return rows.map((m) => ({
      id: m.id,
      quantity: m.quantity,
      from: m.from_location_id && m.from_status ? pos(m.from_location_id, m.from_resource_id, m.from_spot, m.from_status) : null,
      to: pos(m.to_location_id, m.to_resource_id, m.to_spot, m.to_status),
      splitFromItemId: m.split_from_item_id,
      note: m.note,
      movedAt: m.moved_at,
      movedByEmail: m.moved_by ? (emails.get(m.moved_by) ?? null) : null,
    }));
  }

  async positions(): Promise<PositionCatalog> {
    const [l, r] = await Promise.all([
      this.db.from("locations").select("id, name").eq("active", true).order("name"),
      this.db.from("resources").select("id, name, location_id").eq("active", true).order("name"),
    ]);
    if (l.error) throwDbError(l.error);
    if (r.error) throwDbError(r.error);
    return {
      locations: (l.data ?? []).map((loc) => ({
        id: loc.id,
        name: loc.name,
        resources: (r.data ?? []).filter((x) => x.location_id === loc.id).map((x) => ({ id: x.id, name: x.name })),
      })),
    };
  }

  async create(input: EquipmentInput, actor: string | null): Promise<string> {
    const { data, error } = await this.db.rpc("equipment_create", {
      p_category: input.category,
      p_brand: input.brand,
      p_model: input.model,
      p_quantity: input.quantity,
      p_status: input.status,
      p_location: input.locationId,
      p_nickname: input.nickname ?? undefined,
      p_serial: input.serialNumber ?? undefined,
      p_resource: input.resourceId ?? undefined,
      p_spot: input.spot ?? undefined,
      p_purchased_at: input.purchasedAt ?? undefined,
      p_price: input.purchasePriceClp ?? undefined,
      p_vendor: input.vendor ?? undefined,
      p_warranty_until: input.warrantyUntil ?? undefined,
      p_notes: input.notes ?? undefined,
      p_actor: actor ?? undefined,
    });
    if (error) throwDbError(error);
    return data as string;
  }

  async updateDetails(id: string, patch: EquipmentDetailsInput): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error("Ese equipo ya no existe.");
    // La cantidad se corrige solo mientras el ítem tiene su pura fila de alta: con
    // movimientos, cambiarla descuadraría la bitácora (para eso está Mover / split).
    const quantityChanges = patch.quantity !== current.quantity;
    if (quantityChanges && current.moveCount > 1) throw new Error("La cantidad solo se cambia moviendo unidades (Mover).");

    const { error } = await this.db
      .from("equipment_items")
      .update({
        category: patch.category,
        brand: patch.brand,
        model: patch.model,
        nickname: patch.nickname,
        serial_number: patch.serialNumber,
        quantity: patch.quantity,
        purchased_at: patch.purchasedAt,
        purchase_price_clp: patch.purchasePriceClp,
        vendor: patch.vendor,
        warranty_until: patch.warrantyUntil,
        notes: patch.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throwDbError(error);

    if (quantityChanges) {
      const alta = await this.db.from("equipment_moves").update({ quantity: patch.quantity }).eq("item_id", id);
      if (alta.error) throwDbError(alta.error);
    }
  }

  async move(id: string, move: MoveInput, actor: string | null): Promise<{ itemId: string; split: boolean }> {
    const { data, error } = await this.db.rpc("equipment_move", {
      p_item: id,
      p_quantity: move.quantity,
      p_location: move.locationId,
      p_status: move.status,
      p_resource: move.resourceId ?? undefined,
      p_spot: move.spot ?? undefined,
      p_note: move.note ?? undefined,
      p_actor: actor ?? undefined,
    });
    if (error) throwDbError(error);
    const itemId = data as string;
    return { itemId, split: itemId !== id };
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("equipment_items").delete().eq("id", id);
    if (error) throwDbError(error);
  }
}
