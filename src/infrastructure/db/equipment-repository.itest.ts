/**
 * Integración del adapter de inventario: filtros de la lista, ficha con quantityEditable,
 * historial con actor resuelto, regla de cantidad en updateDetails y traducción de errores.
 * Requiere Supabase local; trunca las tablas de equipos (db:reset al terminar).
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseEquiposSearchParams } from "@/src/domain/admin/equipos-list";
import type { EquipmentInput } from "@/src/domain/equipment/equipment";
import { SupabaseEquipmentRepository } from "./equipment-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const repo = new SupabaseEquipmentRepository(createServiceClient(URL, KEY));
const pg = new Client({ connectionString: DB_URL });
let loc = "";
let res = "";
/** super admin del seed: tiene fila en admin_members → el historial resuelve su email. */
let ownerUid = "";

const q = (over: Record<string, string> = {}) => parseEquiposSearchParams(over);

function input(over: Partial<EquipmentInput> = {}): EquipmentInput {
  return {
    category: "cable",
    brand: "Genérico",
    model: "RCA 1 m",
    nickname: null,
    serialNumber: null,
    quantity: 10,
    status: "storage",
    locationId: loc,
    resourceId: res,
    spot: "bodega",
    purchasedAt: null,
    purchasePriceClp: null,
    vendor: null,
    warrantyUntil: null,
    notes: null,
    ...over,
  };
}

beforeAll(async () => {
  await pg.connect();
  loc = (await pg.query("select id from locations where slug = 'vina-del-mar'")).rows[0].id;
  res = (await pg.query("select id from resources where location_id = $1 limit 1", [loc])).rows[0].id;
  ownerUid = (await pg.query("select user_id from admin_members where email = 'benjamin@fotfstudios.cl'")).rows[0].user_id;
});
afterAll(async () => {
  await pg.end();
});
beforeEach(async () => {
  await pg.query("truncate equipment_moves, equipment_items cascade");
});

describe("SupabaseEquipmentRepository", () => {
  it("positions() devuelve la sede con su sala", async () => {
    const cat = await repo.positions();
    expect(cat.locations).toHaveLength(1);
    expect(cat.locations[0]).toMatchObject({ id: loc, resources: [{ id: res, name: "Sala de ensayo DJ" }] });
  });

  it("create + get: ficha con nombres resueltos y quantityEditable true", async () => {
    const id = await repo.create(input({ category: "mixer", brand: "Pioneer", model: "DJM-450", serialNumber: "SN-1", quantity: 1, status: "in_service", spot: "cabina", purchasePriceClp: 690000 }), ownerUid);
    const d = await repo.get(id);
    expect(d).toMatchObject({
      id,
      brand: "Pioneer",
      serialNumber: "SN-1",
      quantity: 1,
      status: "in_service",
      locationId: loc,
      resourceName: "Sala de ensayo DJ",
      spot: "cabina",
      purchasePriceClp: 690000,
      quantityEditable: true,
    });
    expect(await repo.get("00000000-0000-0000-0000-00000000dead")).toBeNull();
  });

  it("list: búsqueda por marca/modelo/apodo/serie, filtro de categoría y estado (activos oculta retired)", async () => {
    const a = await repo.create(input({ category: "reproductor", brand: "Pioneer", model: "XDJ-1000MK2", nickname: "Deck izq", serialNumber: "XDJ-1", quantity: 1, status: "in_service" }), null);
    const b = await repo.create(input({ category: "monitor", brand: "Pioneer DJ", model: "VM-50", serialNumber: "VM-1", quantity: 1, status: "retired" }), null);
    const c = await repo.create(input(), null);

    const all = await repo.list(q());
    expect(all.rows.map((r) => r.id).sort()).toEqual([a, c].sort());
    expect(all.total).toBe(2);
    expect(all.grandTotal).toBe(3);

    expect((await repo.list(q({ estado: "retired" }))).rows.map((r) => r.id)).toEqual([b]);
    expect((await repo.list(q({ cat: "cable" }))).rows.map((r) => r.id)).toEqual([c]);
    expect((await repo.list(q({ q: "deck" }))).rows.map((r) => r.id)).toEqual([a]);
    expect((await repo.list(q({ q: "xdj-1" }))).rows.map((r) => r.id)).toEqual([a]);
    expect((await repo.list(q({ q: "rca" }))).rows.map((r) => r.id)).toEqual([c]);
    // Comodines y delimitadores hostiles no rompen ni sobre-matchean.
    expect((await repo.list(q({ q: "%" }))).rows).toHaveLength(0);
    expect((await repo.list(q({ q: "a,b)" }))).rows).toHaveLength(0);
  });

  it("move completo y parcial; history resuelve el actor y marca el split", async () => {
    const id = await repo.create(input(), ownerUid);
    const full = await repo.move(id, { quantity: 10, status: "in_service", locationId: loc, resourceId: res, spot: "cabina", note: "a la sala" }, ownerUid);
    expect(full).toEqual({ itemId: id, split: false });
    const part = await repo.move(id, { quantity: 4, status: "storage", locationId: loc, resourceId: null, spot: "rack 2", note: null }, ownerUid);
    expect(part.split).toBe(true);
    expect(part.itemId).not.toBe(id);

    const h = await repo.history(id);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ quantity: 10, from: { resourceName: "Sala de ensayo DJ", spot: "bodega", status: "storage" }, to: { spot: "cabina", status: "in_service" }, note: "a la sala", movedByEmail: "benjamin@fotfstudios.cl", splitFromItemId: null });
    expect(h[1].from).toBeNull();

    const hNew = await repo.history(part.itemId);
    expect(hNew).toHaveLength(1);
    expect(hNew[0]).toMatchObject({ quantity: 4, splitFromItemId: id, to: { locationName: "FOTF Studios — Viña del Mar", resourceName: null, spot: "rack 2" } });
    expect((await repo.get(id))?.quantityEditable).toBe(false);
  });

  it("move traduce los errores de la RPC", async () => {
    const id = await repo.create(input(), null);
    await expect(repo.move(id, { quantity: 10, status: "storage", locationId: loc, resourceId: res, spot: "bodega", note: null }, null)).rejects.toThrow("El equipo ya está ahí.");
    await expect(repo.move(id, { quantity: 11, status: "storage", locationId: loc, resourceId: res, spot: "x", note: null }, null)).rejects.toThrow("Cantidad fuera de rango.");
    await expect(repo.move("00000000-0000-0000-0000-00000000dead", { quantity: 1, status: "storage", locationId: loc, resourceId: null, spot: null, note: null }, null)).rejects.toThrow("Ese equipo ya no existe.");
  });

  it("updateDetails: corrige cantidad solo sin movimientos (y ajusta el alta); serie repetida → frase", async () => {
    const id = await repo.create(input(), null);
    await repo.updateDetails(id, { category: "cable", brand: "Genérico", model: "RCA 1 m", nickname: "Caja A", serialNumber: null, quantity: 12, purchasedAt: "2024-01-10", purchasePriceClp: 15000, vendor: "Casa Royal", warrantyUntil: null, notes: null });
    expect(await repo.get(id)).toMatchObject({ nickname: "Caja A", quantity: 12, purchasedAt: "2024-01-10", vendor: "Casa Royal" });
    expect((await pg.query("select quantity from equipment_moves where item_id = $1", [id])).rows[0].quantity).toBe(12);

    await repo.move(id, { quantity: 12, status: "in_service", locationId: loc, resourceId: res, spot: "cabina", note: null }, null);
    await expect(
      repo.updateDetails(id, { category: "cable", brand: "Genérico", model: "RCA 1 m", nickname: null, serialNumber: null, quantity: 5, purchasedAt: null, purchasePriceClp: null, vendor: null, warrantyUntil: null, notes: null }),
    ).rejects.toThrow("La cantidad solo se cambia moviendo unidades (Mover).");

    // Serie repetida: dos unidades (qty 1, sin movimientos) para que la regla de cantidad no
    // se dispare antes que el unique.
    const first = await repo.create(input({ serialNumber: "DUP", quantity: 1 }), null);
    const second = await repo.create(input({ quantity: 1 }), null);
    await expect(
      repo.updateDetails(second, { category: "cable", brand: "Genérico", model: "RCA 1 m", nickname: null, serialNumber: "DUP", quantity: 1, purchasedAt: null, purchasePriceClp: null, vendor: null, warrantyUntil: null, notes: null }),
    ).rejects.toThrow("Ya existe un equipo con esa serie.");
    expect(first).toBeTruthy();
  });

  it("updateDetails: un split bloquea la cantidad en AMBOS lados, no solo en el origen", async () => {
    const a = await repo.create(input({ quantity: 10 }), null);
    const fresh = await repo.get(a);
    expect(fresh?.quantityEditable).toBe(true);

    // A(10) → A(6) + B(4): el origen mantiene su única fila (la de alta) y el nuevo ítem
    // tiene su única fila (un move de split, no una alta) — moveCount por sí solo vería a
    // los dos como "sin movimientos" y dejaría editar la cantidad en cualquiera.
    const { itemId: b, split } = await repo.move(a, { quantity: 4, status: "storage", locationId: loc, resourceId: null, spot: "rack 2", note: null }, null);
    expect(split).toBe(true);

    const da = await repo.get(a);
    const db_ = await repo.get(b);
    expect(da?.quantityEditable).toBe(false);
    expect(db_?.quantityEditable).toBe(false);

    await expect(
      repo.updateDetails(a, { category: "cable", brand: "Genérico", model: "RCA 1 m", nickname: null, serialNumber: null, quantity: 8, purchasedAt: null, purchasePriceClp: null, vendor: null, warrantyUntil: null, notes: null }),
    ).rejects.toThrow("La cantidad solo se cambia moviendo unidades (Mover).");
    await expect(
      repo.updateDetails(b, { category: "cable", brand: "Genérico", model: "RCA 1 m", nickname: null, serialNumber: null, quantity: 5, purchasedAt: null, purchasePriceClp: null, vendor: null, warrantyUntil: null, notes: null }),
    ).rejects.toThrow("La cantidad solo se cambia moviendo unidades (Mover).");

    // La cantidad sigue intacta a ambos lados: el rechazo no dejó la escritura a medias.
    expect((await repo.get(a))?.quantity).toBe(6);
    expect((await repo.get(b))?.quantity).toBe(4);
  });

  it("remove borra el ítem y su historial", async () => {
    const id = await repo.create(input(), null);
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.history(id)).toEqual([]);
  });
});
