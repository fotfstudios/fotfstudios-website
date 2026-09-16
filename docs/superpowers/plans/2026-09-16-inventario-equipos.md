# Inventario de equipos (`/admin/equipos`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner an admin section to register every piece of equipment they own (unit or bundle), where it physically is, and an append-only history of every move.

**Architecture:** Two Postgres tables (`equipment_items` = current state, `equipment_moves` = log) written atomically by two plpgsql RPCs; a pure domain module for catalogs/parsing; a Supabase repository behind a port; a new `/admin/equipos` segment (list + ficha) gated by a new `equipment.manage` permission. Delivered as two PRs so prod never runs code against tables that don't exist yet.

**Tech Stack:** Next.js 15 App Router (server actions), React 19, Tailwind v4, Supabase (Postgres + PostgREST via supabase-js), vitest (unit `*.test.ts`, integration `*.itest.ts` against local Supabase).

**Spec:** `docs/superpowers/specs/2026-09-16-inventario-equipos-design.md`

## Global Constraints

- Copy is **Spanish (Chile)**, precise and direct. Comments in code are Spanish too (match neighbors).
- **Local-first:** everything is verified against local Supabase (`npm run db:start`) before any PR. After any integration test run: `npm run db:reset` (tests truncate tables).
- **Two PRs, in order.** PR1 = migration + permission key + catalogs + seed + itest. PR2 = everything else, merged only after PR1's migration is live in prod (gated CI `migrate` job needs owner approval).
- **Before every push:** `npx eslint .` and `npm run build` both exit 0. Restart `npm run dev` after any `npm run build`.
- Tool-surface rules (`lib/admin-a11y-contract.test.ts`): secondary text `text-bone-quiet` (never `bone-mute`), form controls via `Input`/`Select`/`Textarea` from `components/admin/ui/Field` (they carry `border-ink-edge`), dialogs only via `components/admin/ui/Dialog`, table headers via `Th` (has `scope="col"`), headings `text-3xl sm:text-4xl` (never `clamp()`), labels `.label`, pills `.label-sm`.
- **Sirena (`text-sirena`) only for urgency.** No equipment status uses it.
- Server actions are segment-local (`<segment>/actions.ts`, `"use server"`, `requirePermission("equipment.manage")` first line). Never `redirect()` inside `run()`/`runData()` (they catch it).
- Never render raw Postgres/PostgREST messages; every error the user sees is a Spanish sentence from the domain.
- Git: use `/opt/homebrew/bin/git` (system git triggers the Xcode license prompt). Commit identity is already set in repo config. Conventional Commits. Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Migration file name is fixed: `supabase/migrations/20260916120000_equipment.sql`.

## File structure

**PR1 — branch `feat/inventario-equipos` (already has the spec commit)**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260916120000_equipment.sql` (create) | tables, composite FK, RPCs, permission row, RLS, index |
| `src/domain/equipment/equipment.ts` (create) | `EQUIPMENT_CATEGORIES` / `EQUIPMENT_STATUSES` catalogs only (PR2 adds parsers) |
| `src/domain/auth/permissions.ts` (modify) | `"equipment.manage"` entry |
| `src/infrastructure/db/database.types.ts` (regenerate) | RPC + table types |
| `src/infrastructure/db/equipment.itest.ts` (create) | SQL contract tests |
| `supabase/seed.sql` (modify) | local demo rows |

**PR2 — branch `feat/equipos-admin` (from PR1's branch)**

| File | Responsibility |
|---|---|
| `src/domain/equipment/equipment.ts` (modify) | parsers, position helpers, error copy |
| `src/domain/equipment/equipment.test.ts` (create) | parser unit tests |
| `src/domain/admin/equipos-list.ts` + `.test.ts` (create) | URL state of the list |
| `src/application/ports/equipment.ts` (create) | `EquipmentRepository` port + row types |
| `src/infrastructure/db/equipment-repository.ts` (create) | Supabase adapter |
| `src/infrastructure/db/equipment-repository.itest.ts` (create) | adapter tests |
| `src/composition.ts` (modify) | `equipmentRepository()` |
| `components/admin/ui/DataForm.tsx` (create) | form for actions that return data |
| `components/admin/ui/ConfirmForm.tsx` (modify) | `navigateTo` prop |
| `components/admin/ui/StatusPill.tsx` (modify) | equipment statuses |
| `components/admin/format.ts` (modify) | `fmtDay` for `date` columns |
| `components/admin/AdminShell.tsx`, `components/admin/ui/Sidebar.tsx` (modify) | nav gating |
| `app/admin/(panel)/equipos/page.tsx`, `loading.tsx`, `actions.ts` (create) | list + create |
| `app/admin/(panel)/equipos/_components/EquiposFilters.tsx`, `EquipoFields.tsx`, `PositionFields.tsx`, `NuevoEquipoButton.tsx` (create) | list UI pieces |
| `app/admin/(panel)/equipos/[id]/page.tsx`, `loading.tsx`, `not-found.tsx`, `actions.ts` (create) | ficha |
| `app/admin/(panel)/equipos/[id]/_components/MoverForm.tsx` (create) | move form (handles split navigation) |

---

# PR1 — Esquema

### Task 1: Migration + permission key + catalogs + integration test

**Files:**
- Create: `supabase/migrations/20260916120000_equipment.sql`
- Create: `src/domain/equipment/equipment.ts`
- Modify: `src/domain/auth/permissions.ts:6-21`
- Regenerate: `src/infrastructure/db/database.types.ts`
- Test: `src/infrastructure/db/equipment.itest.ts`

**Interfaces:**
- Produces (SQL): `equipment_create(p_category text, p_brand text, p_model text, p_quantity int, p_status text, p_location uuid, p_nickname text default null, p_serial text default null, p_resource uuid default null, p_spot text default null, p_purchased_at date default null, p_price int default null, p_vendor text default null, p_warranty_until date default null, p_notes text default null, p_actor uuid default null) returns uuid` and `equipment_move(p_item uuid, p_quantity int, p_location uuid, p_status text, p_resource uuid default null, p_spot text default null, p_note text default null, p_actor uuid default null) returns uuid`. Exceptions: `equipment_not_found`, `equipment_bad_quantity`, `equipment_no_change`.
- Produces (TS): `EQUIPMENT_CATEGORIES`, `EquipmentCategory`, `EQUIPMENT_CATEGORY_KEYS`, `EQUIPMENT_STATUSES`, `EquipmentStatus`, `EQUIPMENT_STATUS_KEYS` from `@/src/domain/equipment/equipment`.

- [ ] **Step 1: Make sure local Supabase is up**

Run: `npm run db:start` (no-op if already running) then `npm run db:reset`
Expected: ends with "Finished supabase db reset" and the seed applied.

- [ ] **Step 2: Write the catalogs (needed by the parity test)**

Create `src/domain/equipment/equipment.ts`:

```ts
/**
 * Inventario de equipos — catálogos del dominio. Espejo EXACTO de los CHECK de
 * `equipment_items` (migración 20260916120000_equipment); `equipment.itest.ts` verifica la
 * paridad contra la DB, igual que `PERMISSIONS` contra `admin_permissions`.
 */

export const EQUIPMENT_CATEGORIES = {
  reproductor: "Reproductor",
  mixer: "Mixer",
  monitor: "Monitor",
  audifonos: "Audífonos",
  cable: "Cable",
  computador: "Computador",
  mobiliario: "Mobiliario",
  otro: "Otro",
} as const;
export type EquipmentCategory = keyof typeof EQUIPMENT_CATEGORIES;
export const EQUIPMENT_CATEGORY_KEYS = Object.keys(EQUIPMENT_CATEGORIES) as EquipmentCategory[];

export const EQUIPMENT_STATUSES = {
  in_service: "En uso",
  storage: "Guardado",
  repair: "En reparación",
  loaned: "Prestado",
  retired: "Dado de baja",
} as const;
export type EquipmentStatus = keyof typeof EQUIPMENT_STATUSES;
export const EQUIPMENT_STATUS_KEYS = Object.keys(EQUIPMENT_STATUSES) as EquipmentStatus[];
```

- [ ] **Step 3: Add the permission key in code**

In `src/domain/auth/permissions.ts`, after `"customers.manage": "Gestionar clientes",` add:

```ts
  "equipment.manage": "Gestionar equipos",
```

- [ ] **Step 4: Write the failing integration test**

Create `src/infrastructure/db/equipment.itest.ts`:

```ts
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
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/equipment.itest.ts`
Expected: FAIL — `relation "equipment_moves" does not exist` (from the `beforeEach` truncate).

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20260916120000_equipment.sql`:

```sql
-- Inventario de equipos del estudio (/admin/equipos): qué se posee y DÓNDE está.
--
-- Una fila de `equipment_items` es una unidad física (con serie) o un lote sin serie
-- (`quantity` > 1: cables, adaptadores). La posición ACTUAL vive denormalizada en la fila
-- (sede + sala opcional + lugar libre + estado) y cada cambio de posición deja una fila en
-- `equipment_moves` (append-only, con actor). Las dos escrituras que tocan ambas tablas
-- (`equipment_create`, `equipment_move`) son RPC plpgsql para que sean atómicas: PostgREST
-- no envuelve dos statements en una transacción y un split a medias perdería unidades.
-- Spec: docs/superpowers/specs/2026-09-16-inventario-equipos-design.md

-- Habilita la FK compuesta (resource_id, location_id): una sala solo puede asignarse dentro
-- de su sede. Trivialmente única (id ya es PK); no cambia semántica de `resources`.
alter table resources add constraint resources_id_location_key unique (id, location_id);

create table equipment_items (
  id                 uuid primary key default gen_random_uuid(),
  category           text not null
                     constraint equipment_items_category_valid
                     check (category in ('reproductor', 'mixer', 'monitor', 'audifonos', 'cable', 'computador', 'mobiliario', 'otro')),
  brand              text not null constraint equipment_items_brand_len check (char_length(brand) between 1 and 60),
  model              text not null constraint equipment_items_model_len check (char_length(model) between 1 and 80),
  nickname           text constraint equipment_items_nickname_len check (char_length(nickname) between 1 and 40),
  serial_number      text unique constraint equipment_items_serial_len check (char_length(serial_number) between 1 and 80),
  quantity           integer not null default 1 constraint equipment_items_quantity_pos check (quantity >= 1),
  status             text not null default 'in_service'
                     constraint equipment_items_status_valid
                     check (status in ('in_service', 'storage', 'repair', 'loaned', 'retired')),
  location_id        uuid not null references locations (id) on delete restrict,
  resource_id        uuid,
  spot               text constraint equipment_items_spot_len check (char_length(spot) between 1 and 60),
  purchased_at       date,
  purchase_price_clp integer constraint equipment_items_price_nonneg check (purchase_price_clp >= 0),
  vendor             text constraint equipment_items_vendor_len check (char_length(vendor) between 1 and 80),
  warranty_until     date,
  notes              text constraint equipment_items_notes_len check (char_length(notes) between 1 and 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  -- Una serie identifica exactamente una unidad; los lotes no tienen serie.
  constraint equipment_items_serial_single_unit check (serial_number is null or quantity = 1),
  -- MATCH SIMPLE (default): con resource_id null la FK no se evalúa = "solo sede, sin sala".
  constraint equipment_items_resource_in_location
    foreign key (resource_id, location_id) references resources (id, location_id) on delete restrict
);
create index equipment_items_updated_idx on equipment_items (updated_at desc);

-- Bitácora append-only. `from_*` todos null ⇔ fila de alta. Cascade: borrar el ítem borra
-- su historial; un derivado por split solo pierde el puntero al origen.
create table equipment_moves (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references equipment_items (id) on delete cascade,
  quantity           integer not null constraint equipment_moves_quantity_pos check (quantity >= 1),
  from_location_id   uuid references locations (id) on delete restrict,
  from_resource_id   uuid references resources (id) on delete set null,
  from_spot          text,
  from_status        text,
  to_location_id     uuid not null references locations (id) on delete restrict,
  to_resource_id     uuid references resources (id) on delete set null,
  to_spot            text,
  to_status          text not null
                     constraint equipment_moves_to_status_valid
                     check (to_status in ('in_service', 'storage', 'repair', 'loaned', 'retired')),
  split_from_item_id uuid references equipment_items (id) on delete set null,
  note               text constraint equipment_moves_note_len check (char_length(note) between 1 and 500),
  moved_at           timestamptz not null default now(),
  moved_by           uuid,
  constraint equipment_moves_from_all_or_none check (
    (from_location_id is null and from_status is null) or (from_location_id is not null and from_status is not null)
  )
);
create index equipment_moves_item_idx on equipment_moves (item_id, moved_at desc);

alter table equipment_items enable row level security;   -- sin policies: solo service-role
alter table equipment_moves enable row level security;
grant all privileges on equipment_items to service_role;
grant all privileges on equipment_moves to service_role;

-- Alta: ítem + fila de alta en una transacción. Los nullables van con default null para que
-- los tipos generados los marquen opcionales (el adapter pasa `?? undefined`).
create function equipment_create(
  p_category text, p_brand text, p_model text, p_quantity int, p_status text, p_location uuid,
  p_nickname text default null, p_serial text default null, p_resource uuid default null,
  p_spot text default null, p_purchased_at date default null, p_price int default null,
  p_vendor text default null, p_warranty_until date default null, p_notes text default null,
  p_actor uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into equipment_items (category, brand, model, nickname, serial_number, quantity, status,
      location_id, resource_id, spot, purchased_at, purchase_price_clp, vendor, warranty_until, notes, created_by)
    values (p_category, p_brand, p_model, p_nickname, p_serial, p_quantity, p_status,
      p_location, p_resource, p_spot, p_purchased_at, p_price, p_vendor, p_warranty_until, p_notes, p_actor)
    returning id into v_id;
  insert into equipment_moves (item_id, quantity, to_location_id, to_resource_id, to_spot, to_status, moved_by)
    values (v_id, p_quantity, p_location, p_resource, p_spot, p_status, p_actor);
  return v_id;
end;
$$;

-- Movimiento (posición y/o estado). Completo: actualiza la fila y asienta. Parcial: el
-- original conserva el resto y el lote movido es un ítem NUEVO (sin serie: un lote nunca la
-- tiene) sobre el que se asienta el move con `split_from_item_id`. Devuelve el id del ítem
-- que quedó en el destino. `for update` serializa dos movimientos del mismo ítem.
create function equipment_move(
  p_item uuid, p_quantity int, p_location uuid, p_status text,
  p_resource uuid default null, p_spot text default null, p_note text default null, p_actor uuid default null
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_item equipment_items%rowtype;
  v_new  uuid;
begin
  select * into v_item from equipment_items where id = p_item for update;
  if not found then raise exception 'equipment_not_found'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > v_item.quantity then
    raise exception 'equipment_bad_quantity';
  end if;
  if v_item.location_id = p_location
     and v_item.resource_id is not distinct from p_resource
     and coalesce(v_item.spot, '') = coalesce(p_spot, '')
     and v_item.status = p_status then
    raise exception 'equipment_no_change';
  end if;

  if p_quantity = v_item.quantity then
    update equipment_items
       set location_id = p_location, resource_id = p_resource, spot = p_spot, status = p_status, updated_at = now()
     where id = p_item;
    insert into equipment_moves (item_id, quantity, from_location_id, from_resource_id, from_spot, from_status,
        to_location_id, to_resource_id, to_spot, to_status, note, moved_by)
      values (p_item, p_quantity, v_item.location_id, v_item.resource_id, v_item.spot, v_item.status,
        p_location, p_resource, p_spot, p_status, p_note, p_actor);
    return p_item;
  end if;

  update equipment_items set quantity = quantity - p_quantity, updated_at = now() where id = p_item;
  insert into equipment_items (category, brand, model, nickname, serial_number, quantity, status,
      location_id, resource_id, spot, purchased_at, purchase_price_clp, vendor, warranty_until, notes, created_by)
    values (v_item.category, v_item.brand, v_item.model, v_item.nickname, null, p_quantity, p_status,
      p_location, p_resource, p_spot, v_item.purchased_at, v_item.purchase_price_clp, v_item.vendor,
      v_item.warranty_until, v_item.notes, p_actor)
    returning id into v_new;
  insert into equipment_moves (item_id, quantity, from_location_id, from_resource_id, from_spot, from_status,
      to_location_id, to_resource_id, to_spot, to_status, split_from_item_id, note, moved_by)
    values (v_new, p_quantity, v_item.location_id, v_item.resource_id, v_item.spot, v_item.status,
      p_location, p_resource, p_spot, p_status, p_item, p_note, p_actor);
  return v_new;
end;
$$;

revoke execute on function equipment_create(text, text, text, int, text, uuid, text, text, uuid, text, date, int, text, date, text, uuid) from public, anon, authenticated;
revoke execute on function equipment_move(uuid, int, uuid, text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function equipment_create(text, text, text, int, text, uuid, text, text, uuid, text, date, int, text, date, text, uuid) to service_role;
grant execute on function equipment_move(uuid, int, uuid, text, uuid, text, text, uuid) to service_role;

-- Permiso de la sección. NO se otorga a ningún rol (decisión del dueño, como
-- customers.manage): super_admin lo tiene por definición; el staff, cuando él lo habilite
-- desde /admin/roles.
insert into admin_permissions (key, label)
values ('equipment.manage', 'Gestionar equipos')
on conflict (key) do nothing;
```

- [ ] **Step 7: Apply the migration and regenerate types**

Run: `npm run db:reset && npm run db:types`
Expected: reset finishes without SQL errors; `git diff --stat src/infrastructure/db/database.types.ts` shows additions (tables `equipment_items`, `equipment_moves`, functions `equipment_create`, `equipment_move`).

- [ ] **Step 8: Run the integration test until green**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/equipment.itest.ts`
Expected: 9 tests PASS.

- [ ] **Step 9: Run the RBAC parity test (the new key must match on both sides)**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/rbac.itest.ts`
Expected: PASS (both parity assertions include `equipment.manage`).

- [ ] **Step 10: Reset the DB (tests truncate) and commit**

```bash
npm run db:reset
/opt/homebrew/bin/git add supabase/migrations/20260916120000_equipment.sql src/domain/equipment/equipment.ts src/domain/auth/permissions.ts src/infrastructure/db/database.types.ts src/infrastructure/db/equipment.itest.ts
/opt/homebrew/bin/git commit -m "feat(equipos): esquema de inventario y bitácora de movimientos

Tablas equipment_items (estado actual) + equipment_moves (append-only), RPCs
atómicas equipment_create/equipment_move con split parcial, FK compuesta sala∈sede,
permiso equipment.manage (sin otorgar) y catálogos espejo en el dominio.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Local seed rows

**Files:**
- Modify: `supabase/seed.sql` (append at end of file, after line 221)

**Interfaces:**
- Consumes: `equipment_create(...)` from Task 1 (named-argument call).

- [ ] **Step 1: Append the demo block**

Append to the end of `supabase/seed.sql`:

```sql

-- Inventario demo SOLO local (/admin/equipos): las 5 unidades de la sala + un lote de cables
-- en bodega, vía la RPC para que cada uno tenga su fila de alta. Series ficticias. Prod parte
-- vacía: el dueño carga las reales desde la UI.
do $$
declare
  v_loc uuid;
  v_res uuid;
begin
  select id into v_loc from locations where slug = 'vina-del-mar';
  select id into v_res from resources where location_id = v_loc limit 1;
  if exists (select 1 from equipment_items) then return; end if;

  perform equipment_create(p_category => 'reproductor', p_brand => 'Pioneer', p_model => 'XDJ-1000MK2', p_quantity => 1, p_status => 'in_service', p_location => v_loc,
    p_nickname => 'Deck izquierdo', p_serial => 'SEED-XDJ-0001', p_resource => v_res, p_spot => 'cabina', p_purchased_at => date '2024-03-15', p_price => 1190000, p_vendor => 'Audiomusica', p_warranty_until => date '2026-03-15');
  perform equipment_create(p_category => 'reproductor', p_brand => 'Pioneer', p_model => 'XDJ-1000MK2', p_quantity => 1, p_status => 'in_service', p_location => v_loc,
    p_nickname => 'Deck derecho', p_serial => 'SEED-XDJ-0002', p_resource => v_res, p_spot => 'cabina', p_purchased_at => date '2024-03-15', p_price => 1190000, p_vendor => 'Audiomusica', p_warranty_until => date '2026-03-15');
  perform equipment_create(p_category => 'mixer', p_brand => 'Pioneer', p_model => 'DJM-450', p_quantity => 1, p_status => 'in_service', p_location => v_loc,
    p_serial => 'SEED-DJM-0001', p_resource => v_res, p_spot => 'cabina', p_purchased_at => date '2024-03-15', p_price => 690000, p_vendor => 'Audiomusica', p_warranty_until => date '2026-03-15');
  perform equipment_create(p_category => 'monitor', p_brand => 'Pioneer DJ', p_model => 'VM-50', p_quantity => 1, p_status => 'in_service', p_location => v_loc,
    p_nickname => 'Monitor izquierdo', p_serial => 'SEED-VM50-0001', p_resource => v_res, p_spot => 'cabina', p_purchased_at => date '2024-04-02', p_price => 210000, p_vendor => 'Audiomusica');
  perform equipment_create(p_category => 'monitor', p_brand => 'Pioneer DJ', p_model => 'VM-50', p_quantity => 1, p_status => 'in_service', p_location => v_loc,
    p_nickname => 'Monitor derecho', p_serial => 'SEED-VM50-0002', p_resource => v_res, p_spot => 'cabina', p_purchased_at => date '2024-04-02', p_price => 210000, p_vendor => 'Audiomusica');
  perform equipment_create(p_category => 'cable', p_brand => 'Genérico', p_model => 'RCA 1 m', p_quantity => 10, p_status => 'storage', p_location => v_loc,
    p_resource => v_res, p_spot => 'bodega', p_notes => 'Repuestos para la cabina.');
end $$;
```

- [ ] **Step 2: Verify the seed applies**

Run: `npm run db:reset && psql postgresql://postgres:postgres@127.0.0.1:54422/postgres -c "select brand, model, quantity, spot from equipment_items order by created_at" -c "select count(*) from equipment_moves"`
Expected: 6 item rows (5 × qty 1 in `cabina`, 1 × qty 10 in `bodega`) and `count = 6`. (If `psql` is missing, run the same two queries via `npx supabase db query` or Studio at http://127.0.0.1:54423.)

- [ ] **Step 3: Re-run the equipment itest to confirm the seed doesn't interfere, then reset**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/equipment.itest.ts && npm run db:reset`
Expected: PASS (the `beforeEach` truncate removes seed rows; reset restores them).

- [ ] **Step 4: Commit**

```bash
/opt/homebrew/bin/git add supabase/seed.sql
/opt/homebrew/bin/git commit -m "chore(seed): inventario demo local (5 unidades + lote de cables)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verify and open PR1

- [ ] **Step 1: Full local gate**

Run: `npx eslint . && npm test && npm run build`
Expected: all exit 0. Then restart `npm run dev` if it was running (build breaks a running dev server).

- [ ] **Step 2: Push and open the PR**

```bash
/opt/homebrew/bin/git push -u origin feat/inventario-equipos
gh pr create --base main --title "feat(equipos): esquema de inventario y bitácora de movimientos" --body "$(cat <<'EOF'
## Qué

PR1 de 2 del inventario de equipos (`/admin/equipos`). Solo esquema + permiso + catálogos + seed local + tests de integración. **Nada en runtime toca las tablas nuevas**, así que prod queda sano mientras la migración espera aprobación.

- `equipment_items` (estado actual, una fila por unidad o lote con `quantity`) + `equipment_moves` (bitácora append-only con actor).
- RPCs atómicas `equipment_create` / `equipment_move` (movimiento parcial = split en un ítem nuevo sin serie).
- FK compuesta `(resource_id, location_id) → resources(id, location_id)`: una sala solo dentro de su sede.
- Permiso `equipment.manage` (catálogo SQL + `PERMISSIONS`, sin otorgar a ningún rol).
- RLS sin policies, solo service-role.

Spec: `docs/superpowers/specs/2026-09-16-inventario-equipos-design.md`.

## Prueba

- `src/infrastructure/db/equipment.itest.ts` (9 specs: alta, move completo, split, errores, FK compuesta, cascade, paridad de CHECK, permiso) + `rbac.itest.ts` verde local.
- `npx eslint .`, `npm test`, `npm run build` en verde.

## Después de mergear

Aprobar el job `migrate` (staging → prod). PR2 (`/admin/equipos`) se mergea recién con esta migración viva en prod.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed; CI (lint & build, integration tests) goes green.

---

# PR2 — Sección `/admin/equipos`

> Start from PR1's branch so the migration/types are present: `git checkout feat/inventario-equipos && git checkout -b feat/equipos-admin`. When PR1 merges, retarget this PR to `main` (**before** PR1 is merged, per repo memory: GitHub closes stacked PRs otherwise — retarget as soon as PR1 is approved) and rebase.

### Task 4: Domain — parsers, position helpers, error copy

**Files:**
- Modify: `src/domain/equipment/equipment.ts` (append below the catalogs from Task 1)
- Test: `src/domain/equipment/equipment.test.ts`

**Interfaces:**
- Produces:
  - `EQUIPMENT_CAPS`, `EquipmentInput`, `EquipmentDetailsInput`, `MoveInput`, `PositionCatalog`
  - `parseEquipmentInput(raw: unknown): Result<EquipmentInput>`
  - `parseEquipmentDetails(raw: unknown): Result<EquipmentDetailsInput>`
  - `parseMoveInput(raw: unknown, current: { quantity: number }): Result<MoveInput>`
  - `positionValue(locationId: string, resourceId: string | null): string`, `parsePositionValue(v: string): { locationId: string; resourceId: string | null } | null`, `positionOptions(catalog: PositionCatalog): { value: string; label: string }[]`
  - `positionLabel(p: { locationName: string; resourceName: string | null; spot: string | null }): string`
  - `equipmentErrorMessage(code: string | null | undefined, message: string): string`

- [ ] **Step 1: Write the failing unit tests**

Create `src/domain/equipment/equipment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  equipmentErrorMessage,
  parseEquipmentDetails,
  parseEquipmentInput,
  parseMoveInput,
  parsePositionValue,
  positionLabel,
  positionOptions,
  positionValue,
} from "./equipment";

const LOC = "11111111-1111-4111-8111-111111111111";
const RES = "22222222-2222-4222-8222-222222222222";

const base = {
  category: "reproductor",
  brand: "  Pioneer ",
  model: "XDJ-1000MK2",
  nickname: "",
  serialNumber: "ABC 123",
  quantity: "1",
  status: "in_service",
  locationId: LOC,
  resourceId: RES,
  spot: "  cabina   izq ",
  purchasedAt: "2024-03-15",
  purchasePriceClp: "1190000",
  vendor: "",
  warrantyUntil: "",
  notes: "",
};

describe("parseEquipmentInput", () => {
  it("normaliza: trim, espacios colapsados, vacíos → null, números → int", () => {
    const r = parseEquipmentInput(base);
    expect(r.ok && r.value).toEqual({
      category: "reproductor",
      brand: "Pioneer",
      model: "XDJ-1000MK2",
      nickname: null,
      serialNumber: "ABC 123",
      quantity: 1,
      status: "in_service",
      locationId: LOC,
      resourceId: RES,
      spot: "cabina izq",
      purchasedAt: "2024-03-15",
      purchasePriceClp: 1190000,
      vendor: null,
      warrantyUntil: null,
      notes: null,
    });
  });

  it("acepta un lote sin sala ni serie", () => {
    const r = parseEquipmentInput({ ...base, serialNumber: "", quantity: "10", resourceId: "", category: "cable" });
    expect(r.ok && r.value.quantity).toBe(10);
    expect(r.ok && r.value.resourceId).toBeNull();
  });

  it.each([
    [{ category: "teclado" }, "Categoría no válida."],
    [{ brand: "" }, "La marca es obligatoria."],
    [{ brand: "x".repeat(61) }, "La marca no puede superar los 60 caracteres."],
    [{ model: "" }, "El modelo es obligatorio."],
    [{ quantity: "0" }, "La cantidad debe ser un entero mayor o igual a 1."],
    [{ quantity: "1.5" }, "La cantidad debe ser un entero mayor o igual a 1."],
    [{ quantity: "2" }, "Un equipo con número de serie es una sola unidad (cantidad 1)."],
    [{ status: "lost" }, "Estado no válido."],
    [{ locationId: "nope" }, "Elige una ubicación."],
    [{ resourceId: "nope" }, "Sala no válida."],
    [{ purchasedAt: "15/03/2024" }, "Fecha de compra no válida (AAAA-MM-DD)."],
    [{ purchasedAt: "2024-02-30" }, "Fecha de compra no válida (AAAA-MM-DD)."],
    [{ warrantyUntil: "mañana" }, "Fecha de garantía no válida (AAAA-MM-DD)."],
    [{ purchasePriceClp: "-1" }, "El precio debe ser un entero en pesos, sin decimales."],
    [{ purchasePriceClp: "12.5" }, "El precio debe ser un entero en pesos, sin decimales."],
    [{ notes: "n".repeat(2001) }, "Las notas no pueden superar los 2000 caracteres."],
  ])("rechaza %o", (patch, error) => {
    const r = parseEquipmentInput({ ...base, ...patch });
    expect(r).toEqual({ ok: false, error });
  });

  it("no-objeto → mismos errores que un formulario vacío", () => {
    expect(parseEquipmentInput(null)).toEqual({ ok: false, error: "Categoría no válida." });
  });
});

describe("parseEquipmentDetails", () => {
  it("es el subconjunto sin posición ni estado", () => {
    const r = parseEquipmentDetails({ ...base, status: undefined, locationId: undefined });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(
      ["brand", "category", "model", "nickname", "notes", "purchasePriceClp", "purchasedAt", "quantity", "serialNumber", "vendor", "warrantyUntil"].sort(),
    );
  });
});

describe("parseMoveInput", () => {
  const cur = { quantity: 10 };
  it("acepta cantidad total por defecto y nota opcional", () => {
    const r = parseMoveInput({ quantity: "10", status: "in_service", locationId: LOC, resourceId: RES, spot: "cabina", note: "" }, cur);
    expect(r).toEqual({ ok: true, value: { quantity: 10, status: "in_service", locationId: LOC, resourceId: RES, spot: "cabina", note: null } });
  });
  it.each([
    [{ quantity: "0" }, "Cantidad fuera de rango (1 a 10)."],
    [{ quantity: "11" }, "Cantidad fuera de rango (1 a 10)."],
    [{ status: "" }, "Estado no válido."],
    [{ locationId: "" }, "Elige una ubicación."],
    [{ note: "n".repeat(501) }, "La nota no puede superar los 500 caracteres."],
    [{ spot: "s".repeat(61) }, "El lugar no puede superar los 60 caracteres."],
  ])("rechaza %o", (patch, error) => {
    const r = parseMoveInput({ quantity: "10", status: "storage", locationId: LOC, resourceId: "", spot: "", note: "", ...patch }, cur);
    expect(r).toEqual({ ok: false, error });
  });
});

describe("posición", () => {
  const catalog = {
    locations: [
      { id: LOC, name: "FOTF Studios — Viña del Mar", resources: [{ id: RES, name: "Sala de ensayo DJ" }] },
    ],
  };
  it("codifica y decodifica sede:sala", () => {
    expect(positionValue(LOC, RES)).toBe(`${LOC}:${RES}`);
    expect(positionValue(LOC, null)).toBe(`${LOC}:`);
    expect(parsePositionValue(`${LOC}:${RES}`)).toEqual({ locationId: LOC, resourceId: RES });
    expect(parsePositionValue(`${LOC}:`)).toEqual({ locationId: LOC, resourceId: null });
    expect(parsePositionValue("garbage")).toBeNull();
    expect(parsePositionValue(`${LOC}:nope`)).toBeNull();
  });
  it("lista sede sola y cada sala de la sede", () => {
    expect(positionOptions(catalog)).toEqual([
      { value: `${LOC}:`, label: "FOTF Studios — Viña del Mar (sin sala)" },
      { value: `${LOC}:${RES}`, label: "Sala de ensayo DJ" },
    ]);
  });
  it("positionLabel prefiere la sala y agrega el lugar", () => {
    expect(positionLabel({ locationName: "Sede", resourceName: "Sala de ensayo DJ", spot: "cabina" })).toBe("Sala de ensayo DJ · cabina");
    expect(positionLabel({ locationName: "Sede", resourceName: null, spot: null })).toBe("Sede");
  });
});

describe("equipmentErrorMessage", () => {
  it("traduce claves de las RPC y códigos de Postgres; lo demás es genérico", () => {
    expect(equipmentErrorMessage(null, "equipment_no_change")).toBe("El equipo ya está ahí.");
    expect(equipmentErrorMessage(null, "equipment_bad_quantity")).toBe("Cantidad fuera de rango.");
    expect(equipmentErrorMessage(null, "equipment_not_found")).toBe("Ese equipo ya no existe.");
    expect(equipmentErrorMessage("23505", "duplicate key")).toBe("Ya existe un equipo con esa serie.");
    expect(equipmentErrorMessage("23503", "fk")).toBe("La sala no pertenece a esa sede.");
    expect(equipmentErrorMessage("XX000", "boom")).toBe("No se pudo guardar el equipo. Intenta de nuevo.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/equipment/equipment.test.ts`
Expected: FAIL — `parseEquipmentInput` is not exported.

- [ ] **Step 3: Implement**

Append to `src/domain/equipment/equipment.ts` (keep the catalogs from Task 1 above this; add the import at the top of the file):

```ts
import { err, ok, type Result } from "@/src/domain/shared/result";
```

```ts
/** Topes de las columnas de `equipment_items` / `equipment_moves`. */
export const EQUIPMENT_CAPS = { brand: 60, model: 80, nickname: 40, serial: 80, spot: 60, vendor: 80, notes: 2000, note: 500 } as const;

export interface EquipmentInput {
  category: EquipmentCategory;
  brand: string;
  model: string;
  nickname: string | null;
  serialNumber: string | null;
  quantity: number;
  status: EquipmentStatus;
  locationId: string;
  resourceId: string | null;
  spot: string | null;
  /** AAAA-MM-DD */
  purchasedAt: string | null;
  purchasePriceClp: number | null;
  vendor: string | null;
  /** AAAA-MM-DD */
  warrantyUntil: string | null;
  notes: string | null;
}

/** Lo editable desde la ficha: sin posición ni estado (eso es un movimiento). */
export type EquipmentDetailsInput = Omit<EquipmentInput, "status" | "locationId" | "resourceId" | "spot">;

export interface MoveInput {
  quantity: number;
  status: EquipmentStatus;
  locationId: string;
  resourceId: string | null;
  spot: string | null;
  note: string | null;
}

/** Sedes activas con sus salas activas (para los selects de posición). */
export interface PositionCatalog {
  locations: { id: string; name: string; resources: { id: string; name: string }[] }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const asObj = (raw: unknown): Raw => (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Raw;
/** String recortado con espacios internos colapsados; no-string → "". */
const str = (o: Raw, k: string): string => (typeof o[k] === "string" ? (o[k] as string).trim().replace(/\s+/g, " ") : "");
const opt = (s: string): string | null => (s === "" ? null : s);

/** Entero desde string/number; null si no es entero (acepta "" como null solo si `allowEmpty`). */
function int(o: Raw, k: string): number | null | undefined {
  const v = o[k];
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (s === "") return undefined;
  return /^-?\d+$/.test(s) ? Number.parseInt(s, 10) : null;
}

/** AAAA-MM-DD real (rechaza 2024-02-30). */
function isoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseDetails(o: Raw): Result<EquipmentDetailsInput> {
  const category = str(o, "category") as EquipmentCategory;
  if (!EQUIPMENT_CATEGORY_KEYS.includes(category)) return err("Categoría no válida.");

  const brand = str(o, "brand");
  if (!brand) return err("La marca es obligatoria.");
  if (brand.length > EQUIPMENT_CAPS.brand) return err(`La marca no puede superar los ${EQUIPMENT_CAPS.brand} caracteres.`);
  const model = str(o, "model");
  if (!model) return err("El modelo es obligatorio.");
  if (model.length > EQUIPMENT_CAPS.model) return err(`El modelo no puede superar los ${EQUIPMENT_CAPS.model} caracteres.`);

  const nickname = opt(str(o, "nickname"));
  if (nickname && nickname.length > EQUIPMENT_CAPS.nickname) return err(`El apodo no puede superar los ${EQUIPMENT_CAPS.nickname} caracteres.`);
  const serialNumber = opt(str(o, "serialNumber"));
  if (serialNumber && serialNumber.length > EQUIPMENT_CAPS.serial) return err(`La serie no puede superar los ${EQUIPMENT_CAPS.serial} caracteres.`);

  const quantity = int(o, "quantity");
  if (quantity === undefined || quantity === null || quantity < 1) return err("La cantidad debe ser un entero mayor o igual a 1.");
  if (serialNumber && quantity !== 1) return err("Un equipo con número de serie es una sola unidad (cantidad 1).");

  const purchasedAt = opt(str(o, "purchasedAt"));
  if (purchasedAt && !isoDate(purchasedAt)) return err("Fecha de compra no válida (AAAA-MM-DD).");
  const price = int(o, "purchasePriceClp");
  if (price === null || (price !== undefined && price < 0)) return err("El precio debe ser un entero en pesos, sin decimales.");
  const vendor = opt(str(o, "vendor"));
  if (vendor && vendor.length > EQUIPMENT_CAPS.vendor) return err(`El proveedor no puede superar los ${EQUIPMENT_CAPS.vendor} caracteres.`);
  const warrantyUntil = opt(str(o, "warrantyUntil"));
  if (warrantyUntil && !isoDate(warrantyUntil)) return err("Fecha de garantía no válida (AAAA-MM-DD).");
  const notes = opt(typeof o.notes === "string" ? o.notes.trim() : "");
  if (notes && notes.length > EQUIPMENT_CAPS.notes) return err(`Las notas no pueden superar los ${EQUIPMENT_CAPS.notes} caracteres.`);

  return ok({ category, brand, model, nickname, serialNumber, quantity, purchasedAt, purchasePriceClp: price ?? null, vendor, warrantyUntil, notes });
}

function parsePosition(o: Raw): Result<{ locationId: string; resourceId: string | null; spot: string | null }> {
  const locationId = str(o, "locationId");
  if (!UUID_RE.test(locationId)) return err("Elige una ubicación.");
  const resourceId = opt(str(o, "resourceId"));
  if (resourceId && !UUID_RE.test(resourceId)) return err("Sala no válida.");
  const spot = opt(str(o, "spot"));
  if (spot && spot.length > EQUIPMENT_CAPS.spot) return err(`El lugar no puede superar los ${EQUIPMENT_CAPS.spot} caracteres.`);
  return ok({ locationId, resourceId, spot });
}

function parseStatus(o: Raw): Result<EquipmentStatus> {
  const status = str(o, "status") as EquipmentStatus;
  return EQUIPMENT_STATUS_KEYS.includes(status) ? ok(status) : err("Estado no válido.");
}

/** Alta completa (detalles + posición + estado). Devuelve Result — el dominio no lanza. */
export function parseEquipmentInput(raw: unknown): Result<EquipmentInput> {
  const o = asObj(raw);
  const details = parseDetails(o);
  if (!details.ok) return details;
  const status = parseStatus(o);
  if (!status.ok) return status;
  const pos = parsePosition(o);
  if (!pos.ok) return pos;
  return ok({ ...details.value, status: status.value, ...pos.value });
}

/** Edición de la ficha. La cantidad viaja acá; el repositorio decide si puede cambiar. */
export function parseEquipmentDetails(raw: unknown): Result<EquipmentDetailsInput> {
  return parseDetails(asObj(raw));
}

/** Movimiento: 1..cantidad actual, destino y estado obligatorios, nota opcional. */
export function parseMoveInput(raw: unknown, current: { quantity: number }): Result<MoveInput> {
  const o = asObj(raw);
  const quantity = int(o, "quantity");
  if (quantity === undefined || quantity === null || quantity < 1 || quantity > current.quantity) {
    return err(`Cantidad fuera de rango (1 a ${current.quantity}).`);
  }
  const status = parseStatus(o);
  if (!status.ok) return status;
  const pos = parsePosition(o);
  if (!pos.ok) return pos;
  const note = opt(typeof o.note === "string" ? o.note.trim() : "");
  if (note && note.length > EQUIPMENT_CAPS.note) return err(`La nota no puede superar los ${EQUIPMENT_CAPS.note} caracteres.`);
  return ok({ quantity, status: status.value, ...pos.value, note });
}

/** Valor del <select> de posición: "sede:sala" (sala vacía = solo sede). */
export function positionValue(locationId: string, resourceId: string | null): string {
  return `${locationId}:${resourceId ?? ""}`;
}

export function parsePositionValue(v: string): { locationId: string; resourceId: string | null } | null {
  const i = v.indexOf(":");
  if (i < 0) return null;
  const locationId = v.slice(0, i);
  const resourceId = v.slice(i + 1);
  if (!UUID_RE.test(locationId)) return null;
  if (resourceId && !UUID_RE.test(resourceId)) return null;
  return { locationId, resourceId: resourceId || null };
}

/** Opciones del select: la sede sola y luego cada sala. */
export function positionOptions(catalog: PositionCatalog): { value: string; label: string }[] {
  return catalog.locations.flatMap((l) => [
    { value: positionValue(l.id, null), label: `${l.name} (sin sala)` },
    ...l.resources.map((r) => ({ value: positionValue(l.id, r.id), label: r.name })),
  ]);
}

/** "Sala de ensayo DJ · cabina" — la sala manda; sin sala, la sede. */
export function positionLabel(p: { locationName: string; resourceName: string | null; spot: string | null }): string {
  return [p.resourceName ?? p.locationName, p.spot].filter(Boolean).join(" · ");
}

export const EQUIPMENT_GENERIC_DB_ERROR = "No se pudo guardar el equipo. Intenta de nuevo.";

/** Traduce claves de las RPC (`equipment_*`) y códigos SQLSTATE a frases; nunca deja pasar Postgres crudo. */
export function equipmentErrorMessage(code: string | null | undefined, message: string): string {
  if (message.includes("equipment_no_change")) return "El equipo ya está ahí.";
  if (message.includes("equipment_bad_quantity")) return "Cantidad fuera de rango.";
  if (message.includes("equipment_not_found")) return "Ese equipo ya no existe.";
  if (code === "23505") return "Ya existe un equipo con esa serie.";
  if (code === "23503") return "La sala no pertenece a esa sede.";
  return EQUIPMENT_GENERIC_DB_ERROR;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/equipment/equipment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/opt/homebrew/bin/git add src/domain/equipment/equipment.ts src/domain/equipment/equipment.test.ts
/opt/homebrew/bin/git commit -m "feat(equipos): dominio — parseo de alta, detalles y movimiento

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Domain — list URL state

**Files:**
- Create: `src/domain/admin/equipos-list.ts`
- Test: `src/domain/admin/equipos-list.test.ts`

**Interfaces:**
- Produces: `EQUIPOS_PER_PAGE`, `ESTADO_FILTERS`, `EstadoFilter`, `EquiposListQuery`, `parseEquiposSearchParams(sp)`, `equiposHref(base, patch)`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/admin/equipos-list.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { equiposHref, parseEquiposSearchParams } from "./equipos-list";

describe("parseEquiposSearchParams", () => {
  it("defaults: sin búsqueda, todas las categorías, activos (sin dados de baja), página 1", () => {
    expect(parseEquiposSearchParams({})).toEqual({ q: "", categoria: "", estado: "activos", page: 1, perPage: 25 });
  });
  it("lee y valida cada parámetro", () => {
    expect(parseEquiposSearchParams({ q: "  xdj ", cat: "reproductor", estado: "repair", p: "3" })).toEqual({
      q: "xdj",
      categoria: "reproductor",
      estado: "repair",
      page: 3,
      perPage: 25,
    });
    expect(parseEquiposSearchParams({ cat: "teclado", estado: "lost", p: "-2" })).toMatchObject({ categoria: "", estado: "activos", page: 1 });
    expect(parseEquiposSearchParams({ p: "999999999" }).page).toBe(10_000);
    expect(parseEquiposSearchParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parseEquiposSearchParams({ q: "x".repeat(100) }).q).toHaveLength(80);
  });
});

describe("equiposHref", () => {
  const base = parseEquiposSearchParams({ q: "xdj", cat: "reproductor", estado: "repair", p: "3" });
  it("omite defaults y resetea página al cambiar un filtro", () => {
    expect(equiposHref(parseEquiposSearchParams({}))).toBe("/admin/equipos");
    expect(equiposHref(base)).toBe("/admin/equipos?q=xdj&cat=reproductor&estado=repair&p=3");
    expect(equiposHref(base, { categoria: "" })).toBe("/admin/equipos?q=xdj&estado=repair");
    expect(equiposHref(base, { estado: "activos" })).toBe("/admin/equipos?q=xdj&cat=reproductor");
    expect(equiposHref(base, { page: 2 })).toBe("/admin/equipos?q=xdj&cat=reproductor&estado=repair&p=2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/domain/admin/equipos-list.test.ts`
Expected: FAIL — cannot find module `./equipos-list`.

- [ ] **Step 3: Implement**

Create `src/domain/admin/equipos-list.ts`:

```ts
/**
 * Búsqueda, filtros y paginación de /admin/equipos (puro, sin IO). El estado vive en la
 * URL (?q=&cat=&estado=&p=). Espejo de `clientes-list.ts`. `estado=activos` (default) es
 * "todo menos dados de baja": lo retirado no estorba, pero sigue a un clic.
 */
import { EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUS_KEYS, type EquipmentCategory, type EquipmentStatus } from "@/src/domain/equipment/equipment";

export const EQUIPOS_PER_PAGE = 25;

export const ESTADO_FILTERS = ["activos", ...EQUIPMENT_STATUS_KEYS] as const;
export type EstadoFilter = "activos" | EquipmentStatus;

export interface EquiposListQuery {
  q: string;
  /** "" = todas. */
  categoria: EquipmentCategory | "";
  estado: EstadoFilter;
  page: number;
  perPage: number;
}

const MAX_Q = 80;
/** Tope de página: evita offsets absurdos que PostgREST serializa mal (notación exponencial). */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function oneOf<T extends string>(valid: readonly T[], raw: string | undefined, fallback: T): T {
  return valid.includes(raw as T) ? (raw as T) : fallback;
}

export function parseEquiposSearchParams(sp: Record<string, string | string[] | undefined>): EquiposListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    q: (first(sp.q) ?? "").trim().slice(0, MAX_Q),
    categoria: oneOf<EquipmentCategory | "">(EQUIPMENT_CATEGORY_KEYS, first(sp.cat), ""),
    estado: oneOf<EstadoFilter>(ESTADO_FILTERS, first(sp.estado), "activos"),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: EQUIPOS_PER_PAGE,
  };
}

/** Href de la lista con un parche; cambiar un filtro resetea la página salvo que se pida explícita. */
export function equiposHref(base: EquiposListQuery, patch: Partial<EquiposListQuery> = {}): string {
  const merged = { ...base, ...patch };
  const changesFilter = (["q", "categoria", "estado"] as const).some((k) => k in patch);
  if (changesFilter && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.categoria) sp.set("cat", merged.categoria);
  if (merged.estado !== "activos") sp.set("estado", merged.estado);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/equipos?${qs}` : "/admin/equipos";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/domain/admin/equipos-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/opt/homebrew/bin/git add src/domain/admin/equipos-list.ts src/domain/admin/equipos-list.test.ts
/opt/homebrew/bin/git commit -m "feat(equipos): dominio — estado de la lista en la URL

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Port, Supabase repository, composition

**Files:**
- Create: `src/application/ports/equipment.ts`
- Create: `src/infrastructure/db/equipment-repository.ts`
- Modify: `src/composition.ts` (import near line 10-15; export after `adminRepository` at line ~276)
- Test: `src/infrastructure/db/equipment-repository.itest.ts`

**Interfaces:**
- Consumes: Task 4/5 types; SQL RPCs from Task 1.
- Produces: `EquipmentRepository` (port), `SupabaseEquipmentRepository`, `equipmentRepository()` in composition.

- [ ] **Step 1: Write the port**

Create `src/application/ports/equipment.ts`:

```ts
import type { EquiposListQuery } from "@/src/domain/admin/equipos-list";
import type {
  EquipmentCategory,
  EquipmentDetailsInput,
  EquipmentInput,
  EquipmentStatus,
  MoveInput,
  PositionCatalog,
} from "@/src/domain/equipment/equipment";

/** Posición resuelta a nombres (para renderizar). */
export interface Position {
  locationId: string;
  locationName: string;
  resourceId: string | null;
  resourceName: string | null;
  spot: string | null;
  status: EquipmentStatus;
}

export interface EquipmentRow extends Position {
  id: string;
  category: EquipmentCategory;
  brand: string;
  model: string;
  nickname: string | null;
  serialNumber: string | null;
  quantity: number;
  updatedAt: string;
}

export interface EquipmentDetail extends EquipmentRow {
  purchasedAt: string | null;
  purchasePriceClp: number | null;
  vendor: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  createdAt: string;
  /** Filas en la bitácora (1 = solo el alta → la cantidad aún se puede corregir). */
  moveCount: number;
}

export interface EquipmentMoveRow {
  id: string;
  quantity: number;
  /** null = fila de alta. */
  from: Omit<Position, "locationId" | "resourceId"> | null;
  to: Omit<Position, "locationId" | "resourceId">;
  splitFromItemId: string | null;
  note: string | null;
  movedAt: string;
  movedByEmail: string | null;
}

export interface EquipmentRepository {
  list(query: EquiposListQuery): Promise<{ rows: EquipmentRow[]; total: number; grandTotal: number }>;
  get(id: string): Promise<EquipmentDetail | null>;
  /** Historial, más reciente primero. */
  history(id: string): Promise<EquipmentMoveRow[]>;
  /** Sedes y salas ACTIVAS (para nuevos movimientos). */
  positions(): Promise<PositionCatalog>;
  /** Alta vía RPC (ítem + fila de alta). Devuelve el id. */
  create(input: EquipmentInput, actor: string | null): Promise<string>;
  /** Detalles sin posición. La cantidad solo cambia mientras no hay movimientos. */
  updateDetails(id: string, patch: EquipmentDetailsInput): Promise<void>;
  /** Movimiento vía RPC. `split` = quedó un ítem nuevo (movimiento parcial). */
  move(id: string, move: MoveInput, actor: string | null): Promise<{ itemId: string; split: boolean }>;
  remove(id: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing integration test**

Create `src/infrastructure/db/equipment-repository.itest.ts`:

```ts
/**
 * Integración del adapter de inventario: filtros de la lista, ficha con moveCount,
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

  it("create + get: ficha con nombres resueltos y moveCount 1", async () => {
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
      moveCount: 1,
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
    expect((await repo.get(id))?.moveCount).toBe(2);
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

  it("remove borra el ítem y su historial", async () => {
    const id = await repo.create(input(), null);
    await repo.remove(id);
    expect(await repo.get(id)).toBeNull();
    expect(await repo.history(id)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/equipment-repository.itest.ts`
Expected: FAIL — cannot find module `./equipment-repository`.

- [ ] **Step 4: Implement the repository**

Create `src/infrastructure/db/equipment-repository.ts`:

```ts
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
```

- [ ] **Step 5: Wire composition**

In `src/composition.ts`, add the import next to the other repository imports (after line 10 `SupabaseAdminRepository`):

```ts
import { SupabaseEquipmentRepository } from "@/src/infrastructure/db/equipment-repository";
import type { EquipmentRepository } from "@/src/application/ports/equipment";
```

And after `adminRepository()` (line ~276) add:

```ts
/** Inventario de equipos (/admin/equipos). Repositorio directo: sin reglas que justifiquen un servicio. */
export function equipmentRepository(client: SupabaseClient<Database> = db()): EquipmentRepository {
  return new SupabaseEquipmentRepository(client);
}
```

- [ ] **Step 6: Run the integration test until green, then reset**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/equipment-repository.itest.ts && npm run db:reset`
Expected: 7 tests PASS.

If the `.or()` search test fails on `"a,b)"`: `escapeIlike` replaces `,()"*` with spaces, so the needle becomes `a b` and matches nothing — the assertion is correct; check that `needle` is built from `query.q.toLowerCase()` *before* escaping.

- [ ] **Step 7: Typecheck + lint the new files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "equipment|composition" ; npx eslint src/application/ports/equipment.ts src/infrastructure/db/equipment-repository.ts src/composition.ts`
Expected: no lines from grep (the repo has 20 pre-existing tsc errors in an unrelated test file — ignore those), eslint exit 0.

- [ ] **Step 8: Commit**

```bash
/opt/homebrew/bin/git add src/application/ports/equipment.ts src/infrastructure/db/equipment-repository.ts src/infrastructure/db/equipment-repository.itest.ts src/composition.ts
/opt/homebrew/bin/git commit -m "feat(equipos): puerto y repositorio Supabase del inventario

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Shared kit — `DataForm`, `ConfirmForm.navigateTo`, `StatusPill` entries

**Files:**
- Create: `components/admin/ui/DataForm.tsx`
- Modify: `components/admin/ui/ConfirmForm.tsx`
- Modify: `components/admin/ui/StatusPill.tsx` (add to `MAP`, before the closing `};`)
- Modify: `components/admin/format.ts` (append `fmtDay`)

**Interfaces:**
- Produces: `DataForm<T>({ action, onSuccess, children, className })` where `action: (fd: FormData) => Promise<ActionDataResult<T>>`; `ConfirmForm` accepts optional `navigateTo?: string`; `fmtDay(day: string): string` in `components/admin/format.ts`.

- [ ] **Step 1: Create `DataForm`**

Create `components/admin/ui/DataForm.tsx`:

```tsx
"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ActionDataResult } from "./action";
import { useToast } from "./Toaster";

/**
 * Como ActionForm, pero para actions que DEVUELVEN algo (`runData`) y el caller decide qué
 * hacer con eso (navegar a la ficha creada, al ítem separado…). Mismo contrato de error:
 * inline persistente + toast, porque React 19 limpia el form al enviar.
 */
export function DataForm<T>({
  action,
  onSuccess,
  children,
  className,
}: {
  action: (fd: FormData) => Promise<ActionDataResult<T>>;
  onSuccess: (data: T) => void;
  children: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function run(fd: FormData) {
    setError(null);
    const result = await action(fd);
    if (result.ok) onSuccess(result.data);
    else {
      setError(result.error);
      toast({ tone: "error", message: result.error });
    }
  }

  return (
    <form action={run} className={className}>
      {children}
      {error && (
        <p ref={errorRef} role="alert" className="flex items-start gap-2 border border-sirena/40 bg-sirena/10 px-3 py-2.5 label-sm text-sirena">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Add `navigateTo` to `ConfirmForm`**

In `components/admin/ui/ConfirmForm.tsx`:

Add the import after `import { useState } from "react";`:
```tsx
import { useRouter } from "next/navigation";
```

Add the prop: in the destructuring add `navigateTo,` after `success,` and in the type add `/** Tras el éxito: a dónde ir (p. ej. la lista, cuando se borró la ficha actual). */ navigateTo?: string;` after `success?: string;`.

Inside the component, after `const toast = useToast();` add `const router = useRouter();`, and in `run` change the success branch to:
```tsx
    if (result.ok) {
      if (success) toast({ tone: "ok", message: success });
      if (navigateTo) router.push(navigateTo);
    } else {
```

- [ ] **Step 3: Add equipment statuses to `StatusPill`**

In `components/admin/ui/StatusPill.tsx`, before the closing `};` of `MAP` add:

```ts
  // Inventario de equipos (src/domain/equipment/equipment.ts). Sin sirena: nada acá es urgente.
  in_service: { label: "En uso", tone: "gold" },
  storage: { label: "Guardado", tone: "dim" },
  repair: { label: "En reparación", tone: "dim" },
  loaned: { label: "Prestado", tone: "dim" },
  retired: { label: "Dado de baja", tone: "mute" },
```

- [ ] **Step 4: Add `fmtDay` for calendar dates (no zone shift)**

`fmtDate` runs `setZone("America/Santiago")`, so a date-only column (`purchased_at`, `warranty_until` = `2024-03-15`) parsed at UTC midnight on Vercel would render as the *previous* day. In `components/admin/format.ts`, after `fmtDate` add:

```ts
/** Fecha de calendario (AAAA-MM-DD, columnas `date`): sin conversión de zona, o corre un día. */
export const fmtDay = (day: string): string =>
  DateTime.fromISO(day).setLocale("es").toFormat("d LLL yyyy");
```

- [ ] **Step 5: Verify the contract tests and lint**

Run: `npx vitest run lib/admin-a11y-contract.test.ts && npx eslint components/admin`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
/opt/homebrew/bin/git add components/admin/ui/DataForm.tsx components/admin/ui/ConfirmForm.tsx components/admin/ui/StatusPill.tsx components/admin/format.ts
/opt/homebrew/bin/git commit -m "feat(admin-ui): DataForm, ConfirmForm.navigateTo, fmtDay y estados de equipos en StatusPill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Nav gating + list page + create dialog

**Files:**
- Modify: `components/admin/AdminShell.tsx:17-26`
- Modify: `components/admin/ui/Sidebar.tsx:14,42`
- Create: `app/admin/(panel)/equipos/page.tsx`, `loading.tsx`, `actions.ts`
- Create: `app/admin/(panel)/equipos/_components/EquiposFilters.tsx`, `EquipoFields.tsx`, `PositionFields.tsx`, `NuevoEquipoButton.tsx`

**Interfaces:**
- Consumes: `equipmentRepository()`, `parseEquiposSearchParams`/`equiposHref`, `parseEquipmentInput`, `parsePositionValue`, `positionOptions`, `positionLabel`, `DataForm`.
- Produces: `createEquipmentAction(fd: FormData): Promise<ActionDataResult<{ id: string }>>`; `EquipoFields({ d?, quantityLocked? })`; `PositionFields({ catalog, current? })`.

- [ ] **Step 1: Gate the nav**

`components/admin/AdminShell.tsx` — in the `show` object add after `sii: ...`:
```ts
    equipment: hasPermission(claims, "equipment.manage"),
```

`components/admin/ui/Sidebar.tsx` — line 14, extend the `show` type: add `equipment: boolean` after `sii: boolean`. After the `if (show.lock) ...` line (42) add:
```ts
  // Equipos después de Cerradura: ambos son la sala física (puerta y fierros), no la agenda.
  if (show.equipment) operacion.push({ href: "/admin/equipos", label: "Equipos", icon: "doc" });
```

- [ ] **Step 2: Server actions (list segment)**

Create `app/admin/(panel)/equipos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import { equipmentRepository } from "@/src/composition";
import { parseEquipmentInput, parsePositionValue } from "@/src/domain/equipment/equipment";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Alta desde el diálogo de /admin/equipos. El select de posición viaja como "sede:sala"
 * (positionValue) y se abre acá; todo lo demás lo valida el dominio. Devuelve el id para
 * que el cliente navegue a la ficha (no se puede `redirect()` dentro de runData).
 */
export async function createEquipmentAction(fd: FormData): Promise<ActionDataResult<{ id: string }>> {
  return runData(async () => {
    await requirePermission("equipment.manage");
    const pos = parsePositionValue(String(fd.get("position") ?? ""));
    const parsed = parseEquipmentInput({
      ...Object.fromEntries(fd),
      locationId: pos?.locationId ?? "",
      resourceId: pos?.resourceId ?? "",
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const actor = (await currentClaims())?.sub ?? null;
    const id = await equipmentRepository().create(parsed.value, actor);
    revalidatePath("/admin/equipos");
    return { id };
  });
}
```

- [ ] **Step 3: Field groups (server-compatible, no hooks)**

Create `app/admin/(panel)/equipos/_components/EquipoFields.tsx`:

```tsx
import { Field, Input, Select, Textarea } from "@/components/admin/ui/Field";
import type { EquipmentDetail } from "@/src/application/ports/equipment";
import { EQUIPMENT_CAPS, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_KEYS } from "@/src/domain/equipment/equipment";

/**
 * Campos de detalle (sin posición ni estado), compartidos por el alta y la ficha. Nombres de
 * FormData = claves que lee parseEquipmentInput/parseEquipmentDetails. `quantityLocked`:
 * con movimientos la cantidad no se edita (viaja oculta para que el parse la vea).
 */
export function EquipoFields({ d, quantityLocked = false }: { d?: Partial<EquipmentDetail>; quantityLocked?: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoría">
          <Select name="category" defaultValue={d?.category ?? "reproductor"} required>
            {EQUIPMENT_CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {EQUIPMENT_CATEGORIES[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cantidad" hint={quantityLocked ? "Con movimientos, la cantidad se cambia desde Mover." : "1 por unidad con serie; más para lotes (cables, adaptadores)."}>
          <Input name="quantity" type="number" inputMode="numeric" min={1} step={1} defaultValue={d?.quantity ?? 1} disabled={quantityLocked} required />
          {quantityLocked && <input type="hidden" name="quantity" value={d?.quantity ?? 1} />}
        </Field>
        <Field label="Marca">
          <Input name="brand" defaultValue={d?.brand ?? ""} maxLength={EQUIPMENT_CAPS.brand} autoComplete="off" required />
        </Field>
        <Field label="Modelo">
          <Input name="model" defaultValue={d?.model ?? ""} maxLength={EQUIPMENT_CAPS.model} autoComplete="off" required />
        </Field>
        <Field label="Apodo" hint="Opcional. “Deck izquierdo”, “Caja 1”…">
          <Input name="nickname" defaultValue={d?.nickname ?? ""} maxLength={EQUIPMENT_CAPS.nickname} autoComplete="off" />
        </Field>
        <Field label="Número de serie" hint="Opcional. Con serie, la cantidad es 1.">
          <Input name="serialNumber" defaultValue={d?.serialNumber ?? ""} maxLength={EQUIPMENT_CAPS.serial} autoComplete="off" />
        </Field>
        <Field label="Fecha de compra">
          <Input name="purchasedAt" type="date" defaultValue={d?.purchasedAt ?? ""} />
        </Field>
        <Field label="Precio (CLP)" hint="Entero, sin puntos ni decimales.">
          <Input name="purchasePriceClp" type="number" inputMode="numeric" min={0} step={1} defaultValue={d?.purchasePriceClp ?? ""} />
        </Field>
        <Field label="Proveedor">
          <Input name="vendor" defaultValue={d?.vendor ?? ""} maxLength={EQUIPMENT_CAPS.vendor} autoComplete="off" />
        </Field>
        <Field label="Garantía hasta">
          <Input name="warrantyUntil" type="date" defaultValue={d?.warrantyUntil ?? ""} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea name="notes" defaultValue={d?.notes ?? ""} maxLength={EQUIPMENT_CAPS.notes} />
      </Field>
    </>
  );
}
```

Create `app/admin/(panel)/equipos/_components/PositionFields.tsx`:

```tsx
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { EQUIPMENT_CAPS, EQUIPMENT_STATUSES, EQUIPMENT_STATUS_KEYS, type EquipmentStatus, type PositionCatalog, positionOptions, positionValue } from "@/src/domain/equipment/equipment";

/**
 * Posición + estado, compartidos por el alta y Mover. Un solo select "sede:sala" en vez de
 * dos dependientes: con una sede y una sala, dos selects encadenados serían puro ruido y
 * exigirían un client component. Nombres = claves que lee el parse (position/spot/status).
 */
export function PositionFields({
  catalog,
  current,
}: {
  catalog: PositionCatalog;
  current?: { locationId: string; resourceId: string | null; spot: string | null; status: EquipmentStatus };
}) {
  const options = positionOptions(catalog);
  const selected = current ? positionValue(current.locationId, current.resourceId) : options[0]?.value;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Ubicación">
        <Select name="position" defaultValue={selected} required>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lugar" hint="Libre: “cabina”, “bodega”, “rack 2”…">
        <Input name="spot" defaultValue={current?.spot ?? ""} maxLength={EQUIPMENT_CAPS.spot} autoComplete="off" />
      </Field>
      <Field label="Estado">
        <Select name="status" defaultValue={current?.status ?? "in_service"} required>
          {EQUIPMENT_STATUS_KEYS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_STATUSES[k]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
```

- [ ] **Step 4: Create dialog**

Create `app/admin/(panel)/equipos/_components/NuevoEquipoButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataForm } from "@/components/admin/ui/DataForm";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Icon } from "@/components/admin/ui/icons";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { btn, type BtnSize } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import type { PositionCatalog } from "@/src/domain/equipment/equipment";
import { createEquipmentAction } from "../actions";
import { EquipoFields } from "./EquipoFields";
import { PositionFields } from "./PositionFields";

/** Abre el alta y, al crear, va a la ficha nueva. */
export function NuevoEquipoButton({ catalog, size = "md" }: { catalog: PositionCatalog; size?: BtnSize }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className={`${btn("primary", size)} inline-flex items-center gap-2`} onClick={() => setOpen(true)}>
        <Icon name="add" size={16} />
        Nuevo equipo
      </button>
      {open && (
        <Dialog title="Nuevo equipo" onClose={() => setOpen(false)}>
          <DataForm
            action={createEquipmentAction}
            onSuccess={({ id }) => {
              setOpen(false);
              toast({ tone: "ok", message: "Equipo creado." });
              router.push(`/admin/equipos/${id}`);
            }}
            className="space-y-4"
          >
            <EquipoFields />
            <PositionFields catalog={catalog} />
            <div className="flex justify-end gap-3">
              <button type="button" className={btn("secondary", "sm")} onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <SubmitButton size="sm" pendingLabel="Creando…">
                Crear equipo
              </SubmitButton>
            </div>
          </DataForm>
        </Dialog>
      )}
    </>
  );
}
```

- [ ] **Step 5: Filters (client)**

Create `app/admin/(panel)/equipos/_components/EquiposFilters.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/admin/ui/Field";
import { type EquiposListQuery, ESTADO_FILTERS, equiposHref } from "@/src/domain/admin/equipos-list";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUSES } from "@/src/domain/equipment/equipment";

const ESTADO_LABEL: Record<(typeof ESTADO_FILTERS)[number], string> = {
  activos: "Activos",
  ...EQUIPMENT_STATUSES,
};

/** Dos selects que reescriben la URL (el estado de la lista vive ahí, como en clientes). */
export function EquiposFilters({ query }: { query: EquiposListQuery }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-44">
        <Select
          aria-label="Filtrar por categoría"
          value={query.categoria}
          onChange={(e) => router.replace(equiposHref(query, { categoria: e.target.value as EquiposListQuery["categoria"] }))}
        >
          <option value="">Todas las categorías</option>
          {EQUIPMENT_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_CATEGORIES[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <Select
          aria-label="Filtrar por estado"
          value={query.estado}
          onChange={(e) => router.replace(equiposHref(query, { estado: e.target.value as EquiposListQuery["estado"] }))}
        >
          {ESTADO_FILTERS.map((k) => (
            <option key={k} value={k}>
              {ESTADO_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: List page + loading**

Create `app/admin/(panel)/equipos/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Pagination } from "@/components/admin/ui/Pagination";
import { SearchBox } from "@/components/admin/ui/SearchBox";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate } from "@/components/admin/format";
import { equipmentRepository } from "@/src/composition";
import { equiposHref, parseEquiposSearchParams } from "@/src/domain/admin/equipos-list";
import { EQUIPMENT_CATEGORIES, positionLabel } from "@/src/domain/equipment/equipment";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { EquiposFilters } from "./_components/EquiposFilters";
import { NuevoEquipoButton } from "./_components/NuevoEquipoButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipos — Admin", robots: { index: false } };

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("equipment.manage");
  const query = parseEquiposSearchParams(await searchParams);
  const repo = equipmentRepository();
  const [list, catalog] = await Promise.all([repo.list(query), repo.positions()]);
  const hasFilters = query.q !== "" || query.categoria !== "" || query.estado !== "activos" || query.page > 1;

  return (
    <>
      <PageHeader kicker="Operación" title="Equipos" action={<NuevoEquipoButton catalog={catalog} />} />

      {list.grandTotal === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="doc"
            title="Sin equipos todavía"
            hint="Registra cada unidad con su serie y dónde está. Los cables y adaptadores van como lote con cantidad."
            action={<NuevoEquipoButton catalog={catalog} size="sm" />}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <SearchBox
              defaultValue={query.q}
              basePath="/admin/equipos"
              placeholder="Marca, modelo, apodo o serie…"
              ariaLabel="Buscar equipo por marca, modelo, apodo o serie"
            />
            <EquiposFilters query={query} />
          </div>

          <div className="mt-4">
            {list.rows.length === 0 ? (
              <EmptyState
                size="compact"
                icon="doc"
                title="Sin resultados"
                hint="Prueba con otra búsqueda o cambia los filtros."
                action={
                  hasFilters ? (
                    <Button variant="ghost" size="sm" href="/admin/equipos">
                      Limpiar filtros
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <DataTable
                  minWidthClassName="min-w-[48rem]"
                  head={
                    <>
                      <Th>Equipo</Th>
                      <Th>Categoría</Th>
                      <Th right>Cant.</Th>
                      <Th>Serie</Th>
                      <Th>Ubicación</Th>
                      <Th>Estado</Th>
                      <Th>Actualizado</Th>
                    </>
                  }
                >
                  {list.rows.map((e) => (
                    <Tr key={e.id}>
                      <Td>
                        <Link href={`/admin/equipos/${e.id}`} className="text-bone hover:text-gold">
                          {e.brand} {e.model}
                        </Link>
                        {e.nickname && <span className="ml-2 label-sm text-bone-quiet">{e.nickname}</span>}
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{EQUIPMENT_CATEGORIES[e.category]}</span>
                      </Td>
                      <Td right>
                        <span className="font-mono text-bone-dim">{e.quantity}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs text-bone-dim">{e.serialNumber ?? "—"}</span>
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{positionLabel(e)}</span>
                      </Td>
                      <Td>
                        <StatusPill status={e.status} />
                      </Td>
                      <Td>
                        <span className="text-bone-dim">{fmtDate(e.updatedAt)}</span>
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
                <Pagination query={query} total={list.total} href={(p) => equiposHref(query, { page: p })} />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
```

Create `app/admin/(panel)/equipos/loading.tsx`:

```tsx
import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/equipos: encabezado + búsqueda/filtros + tabla + paginación. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando equipos">
      <SkeletonPageHeader action />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-44" />
        </div>
      </div>
      <div className="mt-4">
        <SkeletonTable rows={8} cols={7} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-44" />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
```

- [ ] **Step 7: Run it in the browser**

Run: `npm run db:reset` (seed rows present), make sure `npm run dev` is running, open http://localhost:3000/admin/equipos as the super admin (magic link via Mailpit http://127.0.0.1:54424).
Expected:
- "Equipos" appears in the sidebar under Operación after Cerradura.
- Table shows 6 seed rows; the cable bundle shows Cant. 10 and "Sala de ensayo DJ · bodega".
- Search "xdj" → 2 rows; Categoría "Monitor" → 2 rows; Estado "Dado de baja" → empty state with "Limpiar filtros".
- "Nuevo equipo": submit with empty brand → inline error "La marca es obligatoria." + error toast; valid submit → toast "Equipo creado." and navigation to `/admin/equipos/<id>` (404 for now — Task 9 adds the ficha; confirm the URL contains a uuid).

- [ ] **Step 8: Lint + contract tests**

Run: `npx eslint app/admin components/admin && npx vitest run lib/admin-a11y-contract.test.ts lib/chrome-contract.test.ts`
Expected: exit 0, PASS.

- [ ] **Step 9: Commit**

```bash
/opt/homebrew/bin/git add components/admin/AdminShell.tsx components/admin/ui/Sidebar.tsx "app/admin/(panel)/equipos"
/opt/homebrew/bin/git commit -m "feat(equipos): lista /admin/equipos con búsqueda, filtros y alta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Ficha — details, move (with split navigation), history, delete

**Files:**
- Create: `app/admin/(panel)/equipos/[id]/page.tsx`, `loading.tsx`, `not-found.tsx`, `actions.ts`
- Create: `app/admin/(panel)/equipos/[id]/_components/MoverForm.tsx`

**Interfaces:**
- Consumes: `EquipoFields`, `PositionFields` (Task 8), `DataForm`, `ConfirmForm` with `navigateTo` (Task 7), repository (Task 6).
- Produces: `updateDetailsAction(prev, fd): Promise<ActionResult>`, `moveEquipmentAction(fd): Promise<ActionDataResult<{ itemId: string; split: boolean; quantity: number }>>`, `removeEquipmentAction(prev, fd): Promise<ActionResult>`.

- [ ] **Step 1: Server actions (ficha segment)**

Create `app/admin/(panel)/equipos/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, type ActionResult, run, runData } from "@/components/admin/ui/action";
import { equipmentRepository } from "@/src/composition";
import { parseEquipmentDetails, parseMoveInput, parsePositionValue } from "@/src/domain/equipment/equipment";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Edición de detalles: sin posición ni estado (eso es Mover). La regla de cantidad vive en el repo. */
export async function updateDetailsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    const parsed = parseEquipmentDetails(Object.fromEntries(fd));
    if (!parsed.ok) throw new Error(parsed.error);
    await equipmentRepository().updateDetails(id, parsed.value);
    revalidatePath(`/admin/equipos/${id}`);
    revalidatePath("/admin/equipos");
  });
}

/**
 * Movimiento. Devuelve a dónde quedó el lote: si fue parcial, `itemId` es el ítem NUEVO y el
 * cliente navega a él (no se puede `redirect()` dentro de runData).
 */
export async function moveEquipmentAction(fd: FormData): Promise<ActionDataResult<{ itemId: string; split: boolean; quantity: number }>> {
  return runData(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    const repo = equipmentRepository();
    const current = await repo.get(id);
    if (!current) throw new Error("Ese equipo ya no existe.");
    const pos = parsePositionValue(str(fd, "position"));
    const parsed = parseMoveInput(
      { ...Object.fromEntries(fd), locationId: pos?.locationId ?? "", resourceId: pos?.resourceId ?? "" },
      { quantity: current.quantity },
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const actor = (await currentClaims())?.sub ?? null;
    const r = await repo.move(id, parsed.value, actor);
    revalidatePath(`/admin/equipos/${id}`);
    if (r.split) revalidatePath(`/admin/equipos/${r.itemId}`);
    revalidatePath("/admin/equipos");
    return { ...r, quantity: parsed.value.quantity };
  });
}

/** Borrado duro (cascade sobre su historial). La navegación a la lista la hace ConfirmForm. */
export async function removeEquipmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    await equipmentRepository().remove(id);
    revalidatePath("/admin/equipos");
  });
}
```

- [ ] **Step 2: Move form (client)**

Create `app/admin/(panel)/equipos/[id]/_components/MoverForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { DataForm } from "@/components/admin/ui/DataForm";
import { Field, Input, Textarea } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { useToast } from "@/components/admin/ui/Toaster";
import type { EquipmentDetail } from "@/src/application/ports/equipment";
import { EQUIPMENT_CAPS, type PositionCatalog } from "@/src/domain/equipment/equipment";
import { PositionFields } from "../../_components/PositionFields";
import { moveEquipmentAction } from "../actions";

/** Mover (posición y/o estado). Un movimiento parcial deja un ítem nuevo: se navega a él. */
export function MoverForm({ item, catalog }: { item: EquipmentDetail; catalog: PositionCatalog }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <DataForm
      action={moveEquipmentAction}
      onSuccess={({ itemId, split, quantity }) => {
        if (split) {
          toast({ tone: "ok", message: `Separadas ${quantity} unidades. Estás viendo el ítem nuevo.` });
          router.push(`/admin/equipos/${itemId}`);
        } else {
          toast({ tone: "ok", message: "Movimiento registrado." });
          router.refresh();
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={item.id} />
      <PositionFields catalog={catalog} current={item} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cantidad a mover" hint={item.quantity > 1 ? `Hasta ${item.quantity}. Menos que el total separa un lote nuevo.` : "Una unidad."}>
          <Input name="quantity" type="number" inputMode="numeric" min={1} max={item.quantity} step={1} defaultValue={item.quantity} disabled={item.quantity === 1} required />
          {item.quantity === 1 && <input type="hidden" name="quantity" value={1} />}
        </Field>
        <Field label="Nota" hint="Opcional. “Se fue a servicio técnico”, “prestado a…”">
          <Textarea name="note" maxLength={EQUIPMENT_CAPS.note} className="min-h-12" />
        </Field>
      </div>
      <SubmitButton pendingLabel="Moviendo…">Mover</SubmitButton>
    </DataForm>
  );
}
```

- [ ] **Step 3: Ficha page**

Create `app/admin/(panel)/equipos/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDate, fmtDateTime, fmtDay } from "@/components/admin/format";
import { equipmentRepository } from "@/src/composition";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, positionLabel } from "@/src/domain/equipment/equipment";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { EquipoFields } from "../_components/EquipoFields";
import { MoverForm } from "./_components/MoverForm";
import { removeEquipmentAction, updateDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo — Admin", robots: { index: false } };

/** Un id malformado va a 404, no a un error de Postgres (mismo guard que clientes). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EquipoDetalle({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("equipment.manage");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const repo = equipmentRepository();
  const item = await repo.get(id);
  if (!item) notFound();
  const [history, catalog] = await Promise.all([repo.history(item.id), repo.positions()]);
  const title = `${item.brand} ${item.model}`;

  return (
    <>
      <nav aria-label="Migas" className="label-sm flex items-center gap-2 text-bone-quiet">
        <Link href="/admin/equipos" className="hover:text-gold">
          Equipos
        </Link>
        <Icon name="chevron" size={12} />
        <span className="text-bone-dim">{title}</span>
      </nav>
      <header className="mt-4 border-b hairline pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-bone sm:text-4xl">{title}</h1>
          <StatusPill status={item.status} />
        </div>
        <p className="mt-2 font-mono text-xs text-bone-dim">
          {EQUIPMENT_CATEGORIES[item.category]}
          {item.nickname && <span className="ml-3">{item.nickname}</span>}
          {item.serialNumber && <span className="ml-3">S/N {item.serialNumber}</span>}
          {item.quantity > 1 && <span className="ml-3">×{item.quantity}</span>}
          <span className="ml-3 label-sm text-bone-quiet">Desde {fmtDate(item.createdAt)}</span>
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Ubicación">
            <p className="font-display text-2xl text-bone">{positionLabel(item)}</p>
            <p className="mt-1 label-sm text-bone-quiet">
              {item.locationName} · {EQUIPMENT_STATUSES[item.status]}
            </p>
            <div className="mt-5 border-t hairline pt-5">
              <h4 className="label text-bone-quiet">Mover</h4>
              <div className="mt-3">
                <MoverForm item={item} catalog={catalog} />
              </div>
            </div>
          </Card>

          <Card title="Detalles">
            <ActionForm action={updateDetailsAction} success="Equipo actualizado." className="space-y-4">
              <input type="hidden" name="id" value={item.id} />
              <EquipoFields d={item} quantityLocked={item.moveCount > 1} />
              <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Compra">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Fecha</dt>
                <dd className="text-bone-dim">{item.purchasedAt ? fmtDay(item.purchasedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Precio</dt>
                <dd className="font-mono text-bone-dim">{item.purchasePriceClp !== null ? formatCLP(item.purchasePriceClp) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Proveedor</dt>
                <dd className="text-bone-dim">{item.vendor ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Garantía</dt>
                <dd className="text-bone-dim">{item.warrantyUntil ? fmtDay(item.warrantyUntil) : "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Historial">
            {history.length === 0 ? (
              <EmptyState size="compact" icon="clock" title="Sin movimientos" />
            ) : (
              <ol className="space-y-4">
                {history.map((m) => (
                  <li key={m.id} className="border-l-2 border-ink-edge pl-3">
                    <p className="font-mono text-xs text-bone-quiet">{fmtDateTime(m.movedAt)}</p>
                    <p className="mt-0.5 text-sm text-bone">
                      {m.from === null ? (
                        <>Alta en {positionLabel(m.to)}</>
                      ) : (
                        <>
                          {positionLabel(m.from)} → {positionLabel(m.to)}
                        </>
                      )}
                      {m.quantity > 1 && <span className="ml-2 font-mono text-xs text-bone-quiet">×{m.quantity}</span>}
                    </p>
                    {m.from !== null && m.from.status !== m.to.status && (
                      <p className="label-sm text-bone-quiet">
                        {EQUIPMENT_STATUSES[m.from.status]} → {EQUIPMENT_STATUSES[m.to.status]}
                      </p>
                    )}
                    {m.splitFromItemId && (
                      <p className="label-sm text-bone-quiet">
                        Separado de{" "}
                        <Link href={`/admin/equipos/${m.splitFromItemId}`} className="text-gold hover:underline">
                          otro lote
                        </Link>
                      </p>
                    )}
                    {m.note && <p className="mt-1 text-sm text-bone-dim">{m.note}</p>}
                    {m.movedByEmail && <p className="mt-0.5 label-sm text-bone-quiet">{m.movedByEmail}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Eliminar">
            <p className="text-sm text-bone-dim">Borra el equipo y todo su historial. Para sacarlo de circulación sin perder el registro, muévelo a “Dado de baja”.</p>
            <div className="mt-4">
              <ConfirmForm
                action={removeEquipmentAction}
                hidden={{ id: item.id }}
                trigger={{ label: "Eliminar equipo" }}
                title="Eliminar equipo"
                message={`Se borra ${title} y sus ${history.length} movimientos. No se puede deshacer.`}
                cta="Eliminar"
                success="Equipo eliminado."
                navigateTo="/admin/equipos"
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Loading + not-found**

Create `app/admin/(panel)/equipos/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonCard } from "@/components/admin/ui/skeletons";

/** Fallback de la ficha de equipo: breadcrumb + encabezado + grid de cards. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando el equipo">
      <Skeleton className="h-3 w-40" />
      <div className="mt-4 border-b hairline pb-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-52" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={10} />
        </div>
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={5} />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
```

Create `app/admin/(panel)/equipos/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/** 404 propio: el del panel habla de "la reserva" y vuelve a /admin/reservas. */
export default function EquipoNotFound() {
  return (
    <EmptyState
      icon="doc"
      title="No encontramos ese equipo"
      hint="Puede que se haya eliminado o que el enlace esté mal escrito."
      action={
        <Link href="/admin/equipos" className={btn("secondary", "md")}>
          ← Volver a equipos
        </Link>
      }
    />
  );
}
```

- [ ] **Step 5: Exercise the whole flow in the browser**

With `npm run dev` running and the seeded DB (`npm run db:reset` if the itests ran since):
1. Open a seed XDJ ficha from the list. Expected: header "Pioneer XDJ-1000MK2" + pill "En uso", Ubicación "Sala de ensayo DJ · cabina", Historial shows one "Alta en Sala de ensayo DJ · cabina" entry with your email.
2. Detalles: quantity field is enabled (moveCount 1); change nickname → "Equipo actualizado." toast; header updates.
3. Mover: status "En reparación", nota "Servicio técnico" → toast "Movimiento registrado."; pill changes; Historial shows "En uso → En reparación" with the note; Detalles quantity is now disabled with the hint.
4. Mover again to the same position/status → inline error "El equipo ya está ahí."
5. Open the cable bundle (qty 10). Mover with cantidad 4, lugar "cabina", estado "En uso" → toast "Separadas 4 unidades…" and navigation to a NEW ficha: ×4, Historial "Sala de ensayo DJ · bodega → Sala de ensayo DJ · cabina ×4", "Separado de otro lote" link back; the original shows ×6.
6. Eliminar on the new ×4 ficha → dialog → "Eliminar" → toast "Equipo eliminado." and navigation to the list; the ×4 row is gone.
7. Visit `/admin/equipos/not-a-uuid` and `/admin/equipos/00000000-0000-0000-0000-000000000000` → the section's 404.
8. Sign in as `staff@fotfstudios.cl` (Mailpit) → no "Equipos" in the sidebar; `/admin/equipos` direct → error boundary (permission denied), same as `/admin/clientes` for staff.

- [ ] **Step 6: Lint, contract tests, typecheck**

Run: `npx eslint app/admin components/admin src && npx vitest run lib/admin-a11y-contract.test.ts lib/chrome-contract.test.ts && npx tsc --noEmit -p . 2>&1 | grep -E "equipos|equipment" `
Expected: eslint exit 0, tests PASS, grep prints nothing.

- [ ] **Step 7: Commit**

```bash
/opt/homebrew/bin/git add "app/admin/(panel)/equipos/[id]"
/opt/homebrew/bin/git commit -m "feat(equipos): ficha con detalles, mover (split), historial y eliminar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Full verification and PR2

- [ ] **Step 1: Full local gate**

Run: `npx eslint . && npm test && npm run test:integration && npm run db:reset && npm run build`
Expected: all exit 0 (MP specs auto-skip without sandbox creds — fine). Restart `npm run dev` afterwards.

- [ ] **Step 2: Push and open the PR**

```bash
/opt/homebrew/bin/git push -u origin feat/equipos-admin
gh pr create --base feat/inventario-equipos --title "feat(equipos): sección /admin/equipos (inventario con historial)" --body "$(cat <<'EOF'
## Qué

PR2 de 2 del inventario de equipos. Todo lo que usa el esquema de PR1 (#<PR1>):

- **Dominio** (`src/domain/equipment`): catálogos, parseo de alta/detalles/movimiento, posición "sede:sala", copy de errores. `src/domain/admin/equipos-list.ts`: estado de la lista en la URL.
- **Puerto + adapter** (`EquipmentRepository`, `SupabaseEquipmentRepository`): lista con búsqueda/filtros (activos oculta dados de baja), ficha con `moveCount`, historial con actor, `updateDetails` (cantidad solo sin movimientos), `move` (split → ítem nuevo), `remove`.
- **UI** `/admin/equipos`: lista + alta en diálogo; ficha con Ubicación + Mover (navega al ítem separado), Detalles, Compra, Historial, Eliminar. Permiso `equipment.manage` gatea sidebar y páginas.
- **Kit**: `DataForm` (actions con payload), `ConfirmForm.navigateTo`, estados de equipos en `StatusPill`.

Spec: `docs/superpowers/specs/2026-09-16-inventario-equipos-design.md`.

## Prueba

- Unit: `equipment.test.ts`, `equipos-list.test.ts`. Integración: `equipment-repository.itest.ts` (+ los de PR1).
- Contratos `admin-a11y-contract` y `chrome-contract` verdes.
- Flujo manual local: alta → ficha → mover (estado, split 10→6+4) → editar → eliminar → 404s → staff sin permiso no ve la sección.

## Merge

Retarget a `main` cuando #<PR1> esté aprobado (antes de mergearlo). Mergear **solo** con la migración de PR1 aplicada en prod.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Replace `#<PR1>` with the PR1 number before running. Expected: PR URL; CI green.

- [ ] **Step 3: Record the state in memory**

Update the project memory index with a one-line pointer to a new `inventario-equipos-prs.md` memory noting: PR numbers, that PR2 must be retargeted to `main` before PR1 merges, and that prod migration approval is a manual step for the owner.

---

## Self-review

**Spec coverage.** Data model, composite FK, both RPCs incl. split and the three exceptions → Task 1. Permission (not granted) → Task 1 + Sidebar/Shell gating in Task 8. RLS → Task 1. Seed → Task 2. Domain parsers, position helpers, labels → Task 4. List URL state with `retired` hidden by default → Task 5. Port/adapter (list/get/history/positions/create/updateDetails/move/remove), actor email, error translation, quantity rule → Task 6. `DataForm`/`ConfirmForm.navigateTo`/`StatusPill` → Task 7. List page, filters, alta dialog → Task 8. Ficha (Ubicación+Mover, Detalles, Compra, Historial with Alta/split labels, Eliminar), loading/not-found → Task 9. Edge cases: duplicate serial (Task 4 copy + Task 6 test), no-op move (Task 1 + 6), cross-location room (Task 1), delete with split descendants (Task 1), concurrency via `for update` (Task 1 SQL). Two-PR delivery → Tasks 3 and 10. Out of scope items untouched.

**Placeholder scan.** None; every code step has full content. `#<PR1>` in the PR2 body is an explicit substitution instruction.

**Type consistency.** `EquipmentDetail` (port) is what `EquipoFields.d`, `MoverForm.item`, and `PositionFields.current` consume — `current` needs `locationId/resourceId/spot/status`, all present on `Position` which `EquipmentRow` extends. `positionLabel` takes `{ locationName, resourceName, spot }`; `EquipmentRow` and `EquipmentMoveRow.from/to` both carry those. `moveEquipmentAction` returns `{ itemId, split, quantity }` and `MoverForm.onSuccess` destructures exactly that. `createEquipmentAction` returns `{ id }` and `NuevoEquipoButton` reads `{ id }`. RPC arg names in the adapter match the SQL signatures in Task 1 and the itest's `CreateArgs`/`MoveArgs`.
