/**
 * Integración: contrato SQL del inventario (migración 20260916120000_equipment).
 *
 * Cubre lo que la migración promete y ningún adapter puede garantizar solo: las RPC
 * `equipment_create`/`equipment_move` son atómicas y dejan bitácora, el movimiento parcial
 * separa un ítem nuevo sin serie apuntando al origen, la FK compuesta impide asignar una sala
 * de otra sede, los CHECK de categoría/estado espejan el dominio y el permiso existe.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUS_KEYS } from "@/src/domain/equipment/equipment";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
/** Usuario auth del miembro staff del seed (moved_by no tiene FK; cualquier uuid sirve). */
const ACTOR = "00000000-0000-0000-0000-0000000000a2";

const db = createServiceClient(URL, KEY);
const pg = new Client({ connectionString: DB_URL });
let loc = "";
let res = "";

const raw = (sql: string, params: unknown[] = []) => pg.query(sql, params);

type CreateArgs = {
  p_category: string;
  p_brand: string;
  p_model: string;
  p_quantity: number;
  p_status: string;
  p_location: string;
  p_nickname?: string;
  p_serial?: string;
  p_resource?: string;
  p_spot?: string;
  p_purchased_at?: string;
  p_price?: number;
  p_vendor?: string;
  p_warranty_until?: string;
  p_notes?: string;
  p_actor?: string;
};

/** Lote de 10 cables en bodega, salvo override. */
async function create(over: Partial<CreateArgs> = {}): Promise<string> {
  const args: CreateArgs = {
    p_category: "cable",
    p_brand: "Genérico",
    p_model: "RCA 1 m",
    p_quantity: 10,
    p_status: "storage",
    p_location: loc,
    p_resource: res,
    p_spot: "bodega",
    p_actor: ACTOR,
    ...over,
  };
  const { data, error } = await db.rpc("equipment_create", args);
  if (error) throw error;
  return data as string;
}

type MoveArgs = {
  p_item: string;
  p_quantity: number;
  p_location: string;
  p_status: string;
  p_resource?: string;
  p_spot?: string;
  p_note?: string;
  p_actor?: string;
};
const move = (args: MoveArgs) => db.rpc("equipment_move", args);

beforeAll(async () => {
  await pg.connect();
  loc = (await raw("select id from locations where slug = 'vina-del-mar'")).rows[0].id;
  res = (await raw("select id from resources where location_id = $1 limit 1", [loc])).rows[0].id;
});
afterAll(async () => {
  await pg.end();
});
beforeEach(async () => {
  await raw("truncate equipment_moves, equipment_items cascade");
});

describe("equipment_create", () => {
  it("deja el ítem con su posición y UNA fila de alta (from_* null, actor)", async () => {
    const id = await create({ p_nickname: "Caja 1" });
    const item = (await raw("select * from equipment_items where id = $1", [id])).rows[0];
    expect(item).toMatchObject({ category: "cable", quantity: 10, status: "storage", location_id: loc, resource_id: res, spot: "bodega", nickname: "Caja 1", created_by: ACTOR });
    const moves = (await raw("select * from equipment_moves where item_id = $1", [id])).rows;
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ quantity: 10, from_location_id: null, from_status: null, to_location_id: loc, to_resource_id: res, to_spot: "bodega", to_status: "storage", moved_by: ACTOR, split_from_item_id: null });
  });

  it("una serie exige cantidad 1 (check) y no se repite (unique)", async () => {
    await expect(create({ p_serial: "SN-1", p_quantity: 2 })).rejects.toMatchObject({ code: "23514" });
    await create({ p_serial: "SN-1", p_quantity: 1 });
    await expect(create({ p_serial: "SN-1", p_quantity: 1 })).rejects.toMatchObject({ code: "23505" });
  });

  it("la FK compuesta rechaza una sala que no pertenece a la sede", async () => {
    await raw("insert into locations (name, slug) values ('Otra sede', 'itest-otra-sede') on conflict (slug) do nothing");
    const otherLoc = (await raw("select id from locations where slug = 'itest-otra-sede'")).rows[0].id;
    try {
      // Sala de la sede principal, pero apuntando a la otra sede.
      await expect(create({ p_location: otherLoc, p_resource: res })).rejects.toMatchObject({ code: "23503" });
      // Sin sala, cualquier sede vale (MATCH SIMPLE no evalúa la FK con resource_id null).
      await expect(create({ p_location: otherLoc, p_resource: undefined })).resolves.toBeTruthy();
    } finally {
      await raw("truncate equipment_moves, equipment_items cascade");
      await raw("delete from locations where slug = 'itest-otra-sede'");
    }
  });
});

describe("equipment_move", () => {
  it("mover todo el lote actualiza la posición y asienta from → to", async () => {
    const id = await create();
    const { data, error } = await move({ p_item: id, p_quantity: 10, p_location: loc, p_resource: res, p_spot: "cabina", p_status: "in_service", p_note: "a la sala", p_actor: ACTOR });
    expect(error).toBeNull();
    expect(data).toBe(id);
    const item = (await raw("select quantity, spot, status, updated_at > created_at as touched from equipment_items where id = $1", [id])).rows[0];
    expect(item).toMatchObject({ quantity: 10, spot: "cabina", status: "in_service", touched: true });
    const last = (await raw("select * from equipment_moves where item_id = $1 order by moved_at desc limit 1", [id])).rows[0];
    expect(last).toMatchObject({ quantity: 10, from_spot: "bodega", from_status: "storage", to_spot: "cabina", to_status: "in_service", note: "a la sala", moved_by: ACTOR, split_from_item_id: null });
    expect((await raw("select count(*)::int as n from equipment_moves where item_id = $1", [id])).rows[0].n).toBe(2);
  });

  it("mover parte del lote separa un ítem nuevo sin serie que apunta al origen", async () => {
    const id = await create({ p_notes: "compra 2024" });
    const { data: newId, error } = await move({ p_item: id, p_quantity: 4, p_location: loc, p_resource: res, p_spot: "cabina", p_status: "in_service", p_actor: ACTOR });
    expect(error).toBeNull();
    expect(newId).not.toBe(id);
    const orig = (await raw("select quantity, spot from equipment_items where id = $1", [id])).rows[0];
    expect(orig).toMatchObject({ quantity: 6, spot: "bodega" });
    const split = (await raw("select * from equipment_items where id = $1", [newId])).rows[0];
    expect(split).toMatchObject({ quantity: 4, spot: "cabina", status: "in_service", serial_number: null, notes: "compra 2024", brand: "Genérico", created_by: ACTOR });
    const mv = (await raw("select * from equipment_moves where item_id = $1", [newId])).rows;
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ quantity: 4, from_spot: "bodega", to_spot: "cabina", split_from_item_id: id });
    // El original conserva solo su alta: el split se asienta sobre el nuevo.
    expect((await raw("select count(*)::int as n from equipment_moves where item_id = $1", [id])).rows[0].n).toBe(1);
  });

  it("rechaza cantidad fuera de rango, destino sin cambios e ítem inexistente", async () => {
    const id = await create();
    for (const q of [0, 11]) {
      const { error } = await move({ p_item: id, p_quantity: q, p_location: loc, p_resource: res, p_spot: "cabina", p_status: "in_service" });
      expect(error?.message).toContain("equipment_bad_quantity");
    }
    const same = await move({ p_item: id, p_quantity: 10, p_location: loc, p_resource: res, p_spot: "bodega", p_status: "storage" });
    expect(same.error?.message).toContain("equipment_no_change");
    // Solo cambia el estado: sí es un movimiento (reparación, baja).
    const statusOnly = await move({ p_item: id, p_quantity: 10, p_location: loc, p_resource: res, p_spot: "bodega", p_status: "repair" });
    expect(statusOnly.error).toBeNull();
    const ghost = await move({ p_item: "00000000-0000-0000-0000-00000000dead", p_quantity: 1, p_location: loc, p_status: "storage" });
    expect(ghost.error?.message).toContain("equipment_not_found");
  });

  it("borrar un ítem borra su historial y suelta split_from_item_id del derivado", async () => {
    const id = await create();
    const { data: newId } = await move({ p_item: id, p_quantity: 3, p_location: loc, p_status: "storage", p_spot: "rack 2" });
    await raw("delete from equipment_items where id = $1", [id]);
    expect((await raw("select count(*)::int as n from equipment_moves where item_id = $1", [id])).rows[0].n).toBe(0);
    const mv = (await raw("select split_from_item_id from equipment_moves where item_id = $1", [newId])).rows[0];
    expect(mv.split_from_item_id).toBeNull();
  });
});

describe("paridad con el dominio", () => {
  const literals = (def: string) => [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

  it("los CHECK de categoría y estado espejan EQUIPMENT_CATEGORIES / EQUIPMENT_STATUSES", async () => {
    const cat = (await raw("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'equipment_items_category_valid'")).rows[0].def;
    expect(literals(cat)).toEqual([...EQUIPMENT_CATEGORY_KEYS].sort());
    const st = (await raw("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'equipment_items_status_valid'")).rows[0].def;
    expect(literals(st)).toEqual([...EQUIPMENT_STATUS_KEYS].sort());
    const mvSt = (await raw("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'equipment_moves_to_status_valid'")).rows[0].def;
    expect(literals(mvSt)).toEqual([...EQUIPMENT_STATUS_KEYS].sort());
  });

  it("el permiso equipment.manage existe en admin_permissions y no está otorgado a ningún rol", async () => {
    const perm = (await raw("select label from admin_permissions where key = 'equipment.manage'")).rows;
    expect(perm).toHaveLength(1);
    const granted = (await raw("select count(*)::int as n from admin_role_permissions where permission = 'equipment.manage'")).rows[0].n;
    expect(granted).toBe(0);
  });
});
