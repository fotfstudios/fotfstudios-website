# Directorio de clientes — PR1 (expand) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR1 of the customer-directory chain — the *expand* migration that gives `customers` its own identity, links `reservations`/`orders` to it, and defines (without executing) the five directory RPCs — plus seed, regenerated types and integration tests, all tolerated by the code that is live today.

**Architecture:** One migration file (`20260909120000_customer_directory.sql`) built up section by section: DDL first (identity, constraints, `phone_digits`, `customer_id`, `booking_events` widening), then one function per task (`upsert_guest_customer`, `ensure_customer_for_user`, `backfill_customers_from_bookings`, `update_customer_contact`, `assign_booking_customer`). The load-bearing invariant is SQL-enforced: **every writer of `customer_id` also rewrites the reservation/order snapshot columns (`customer_name/email/phone`) from the `customers` row**, so the live points functions — which resolve a person through `lower(orders.customer_email) = customers.email` — stay byte-identical. Nothing in PR1 runs the backfill or changes `create_checkout`; that is PR3.

**Tech Stack:** Supabase local (Postgres 17, CLI on ports API 54421 / DB 54422), plpgsql migrations, `supabase gen types`, vitest integration tests (`*.itest.ts`) driven through the `pg` client, Next.js 15 type-check via `npm run build`.

**Spec:** `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` (owner-approved design incl. the critic fixes; read it first — this plan argues from it). Background: `docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md` (points model) and `docs/audits/2026-07-07-supabase-schema-audit.md` §C6.

## Global Constraints

- **Language:** user-facing copy and SQL `raise exception` guard texts in Chilean Spanish; identifiers, error codes (`customer_not_found`, …) and commit messages in English. Comments follow the surrounding file (this repo's migrations and itests are commented in Spanish).
- **Regex single-backslash rule (SQL files, verbatim):** `'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'` and `regexp_replace(coalesce(phone, ''), '\D', '', 'g')` — exactly ONE backslash before `s`, before `.` and before `D` in the `.sql` file (`standard_conforming_strings = on`; a double backslash makes the shape gate reject `matias.rojas@gmail.com` and `phone_digits` strip nothing). The itests never embed the regex in a TS string literal (where `\s` would need `\\s`); they exercise the gate through the SQL functions.
- **No email-shape CHECK constraint on `customers`** (a NOT VALID check is still enforced on UPDATE, and `apply_points` updates `customers` → a legacy odd auth email would abort payments/refunds). Shape is enforced only by writers: `parseCustomerInput` (app, PR2), `upsert_guest_customer`, `backfill_customers_from_bookings` and `update_customer_contact` (SQL gate). Keep `customers_email_lower`, the unique email, `customers_contact_required`, `customers_name_len`, `customers_phone_len`.
- `customers_email_key` (unique on `email`) already exists → `on conflict (email)` is valid. The `customers.id → auth.users` FK is dropped by looking its name up in `pg_constraint`, never by assuming it. RLS stays enabled on `customers` with zero policies (service-role only); no new grants needed.
- **Expand/contract (DEPLOY.md):** this PR must not break the live code. Only nullable/defaulted columns, indexes and new functions; `create_checkout`, `confirm_payment`, `mark_refunded`, `reschedule_down`, `apply_reschedule_charge`, `award_retro_points`, `release_order_redemption`, `refund_points_order`, `apply_points` are NOT touched. The backfill is defined, not executed.
- **Snapshot invariant:** every writer of `customer_id` (`update_customer_contact`, `assign_booking_customer`, the backfill link step, the seed) writes `customer_name/email/phone` from the `customers` row (`customers.email` is lowercase, so the email join always resolves to the linked row). The same holds for every writer of `customers.email` on a row that may already be linked (`ensure_customer_for_user`'s auth-email refresh, `update_customer_contact`): both go through the private helper `customer_sync_snapshots` (Task 3), so no linked order/reservation is ever left carrying a stale email that the claw-back joins would resolve to nobody — or to another ficha.
- **Local-first:** everything is verified against the local Supabase (`npm run db:start`, Docker). Never against prod. Integration tests wipe the seed → **always finish with `npm run db:reset`; never leave the local DB seed-less.**
- Before pushing: `npx eslint .`, `npm test`, `npm run test:integration`, `npm run build` all exit 0. No new npm dependencies.
- Conventional Commits, small atomic commits, every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (pass it as a second `-m`). Branch `feat/directorio-clientes-db`, squash-merged via PR.
- Function bodies use the repo convention `language plpgsql set search_path = public, pg_temp`.
- Run one itest file: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts` (add `-t "<describe title>"` to run one block). The suite runs files sequentially (`fileParallelism: false`); each file truncates its tables in `beforeEach`.
- On this machine `git` on `PATH` is Apple's shim and may refuse with "You have not agreed to the Xcode license agreements"; if so, use `/opt/homebrew/bin/git` for every git command below (same arguments). `gh` is at `/opt/homebrew/bin/gh`.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260909120000_customer_directory.sql` | create (Task 1), append (Tasks 2–6) | The one expand migration: DDL + five directory RPCs (+ the private helper `customer_sync_snapshots`), each under a `-- ── … ──` section header. |
| `supabase/seed.sql` | modify (Task 7) | Demo directory: auth user `…00a3` (Felipe, whose `customers.id` is that same `…00a3`), customers `…f1, …f2, …f4..f7`, `customer_id` on demo orders/reservations, retro for Matías/Catalina/Felipe/Valentina, backfill smoke. |
| `src/infrastructure/db/database.types.ts` | regenerate (Task 8) | `npm run db:types` output — never hand-edited. |
| `src/application/ports/customers.ts` | modify (Task 8) | `CustomerProfile.email: string \| null`. |
| `src/infrastructure/db/customers-directory.itest.ts` | create (Task 1), append (Tasks 2–6) | Integration tests for the migration, `pg`-only. |
| `src/infrastructure/db/booking-events.itest.ts` | modify (Task 1, Task 9) | `customer_changed` → Reservas; cleanup string. |
| 14 other `*.itest.ts` files | modify (Task 9) | Add `customers` to every cleanup that already truncates `reservations, orders`. |
| `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` | commit (Task 0) | Written by another agent — reference only. |
| `docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md` | commit (Task 0) | Points-timing note — already appended by the spec author; verify only. |
| `docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md` | commit (Task 0) | This plan. |

## Migration file layout (section order — each task appends under its header)

```
-- header comment (Task 1)
-- ── 1. Guardas + normalización ──            (Task 1)
-- ── 2. Identidad propia ──                   (Task 1)
-- ── 3. Email opcional + constraints ──       (Task 1)
-- ── 4. phone_digits + índices ──             (Task 1)
-- ── 5. customer_id en reservas y pedidos ──  (Task 1)
-- ── 6. booking_events: customer_changed ──   (Task 1)
-- ── 7. upsert_guest_customer ──              (Task 2)
-- ── 8. customer_sync_snapshots + ensure_customer_for_user ── (Task 3)
-- ── 9. backfill_customers_from_bookings ──   (Task 4)
-- ── 10. update_customer_contact ──           (Task 5)
-- ── 11. assign_booking_customer ──           (Task 6)
```

---

### Task 0: Branch and commit the design docs

**Files:**
- Commit (written by another agent — do NOT write it): `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md`
- Commit (already modified by the spec author — verify only, do not edit): `docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md`
- Commit: `docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md` (this file)

**Interfaces:**
- Produces: branch `feat/directorio-clientes-db` that every later task commits to.

- [ ] **Step 1: Confirm you are on the feature branch (it already exists and is checked out).**

```bash
/opt/homebrew/bin/git branch --show-current
```

Expected: `feat/directorio-clientes-db` (already at main's HEAD, `a97192c`, with the two new docs untracked and the cuenta-puntos note uncommitted). If it prints anything else, `git switch feat/directorio-clientes-db` — the branch exists, so `git checkout -b` would abort with "a branch named 'feat/directorio-clientes-db' already exists". Do NOT run `git checkout main && git pull` here: the uncommitted note would ride along and the branch is already at main's HEAD. Only if `git switch` reports that the branch does not exist: `git switch -c feat/directorio-clientes-db`.

- [ ] **Step 2: Confirm the spec exists.** `ls docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` — if it is missing, stop and wait for it; do not write it yourself. Read it once end to end.

- [ ] **Step 3: Verify the points-timing note is already on the 2026-07-04 spec.** The spec's author appended a `## Nota 2026-09-09 — directorio de clientes` section at the end of `docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md` (it states: guests with a valid email get a `customers` row at checkout and earn at `confirm_payment`; backfilled customers get retro at activation; balances identical thanks to `points_ledger_once`; `customers.id` is no longer `auth.users.id`; points functions byte-identical). Check it with `tail -20 docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md` and `git status --short docs/` (the file shows as modified). Do NOT append a second note; if it is missing, stop and ask — the spec author owns that text.

- [ ] **Step 4: Commit the docs.**

```bash
git add docs/superpowers/specs/2026-09-09-directorio-clientes-design.md docs/superpowers/specs/2026-07-04-cuenta-puntos-design.md docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md
git commit -m "docs: customer directory design spec, cuenta-puntos note and PR1 plan" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Migration DDL — own identity, constraints, `phone_digits`, `customer_id`, `customer_changed`

**Files:**
- Create: `supabase/migrations/20260909120000_customer_directory.sql` (sections 1–6)
- Create: `src/infrastructure/db/customers-directory.itest.ts` (scaffold + schema tests)
- Modify: `src/infrastructure/db/booking-events.itest.ts` (append a describe after line 166)

**Interfaces:**
- Consumes: current `customers` table (`supabase/migrations/20260704113000_customers_points.sql:18-26`: `id uuid primary key references auth.users (id) on delete cascade, email text unique not null, name, phone, points_balance, created_at, updated_at`); `booking_events_type_check` and `booking_event_category` as last defined in `supabase/migrations/20260824120000_curso_dj.sql:202-225`.
- Produces (schema later tasks rely on):
  - `customers.id uuid default gen_random_uuid()` (no FK to auth.users), `customers.auth_user_id uuid unique null references auth.users(id) on delete set null`, `customers.email text null` (unique `customers_email_key` kept), `customers.phone_digits text generated`, constraints `customers_email_lower`, `customers_contact_required`, `customers_name_len`, `customers_phone_len`, indexes `customers_phone_digits_idx`, `customers_created_idx`.
  - `reservations.customer_id uuid null references customers(id) on delete set null` + `reservations_customer_idx`; `orders.customer_id` likewise + `orders_customer_idx`.
  - `booking_events.type` accepts `'customer_changed'`; `booking_event_category('customer_changed') = 'Reservas'`.
  - Test helpers exported to later tasks inside the itest file: `customer(...)`, `booking(...)`, `pay(orderId, ref)`, `snapshot(table, id)`, `balance(id)`, `ledgerSum(id)`, `expectBalanceConsistent(id)`, `count(fromClause, params?)`, `insertAuthUser(id, email)`, constants `U1`, `U2`, `U_HOLDER`, `ACTOR`, second client `pg2`.

- [ ] **Step 1: Write the failing schema tests — create `src/infrastructure/db/customers-directory.itest.ts`:**

```ts
/**
 * Directorio de clientes (migración customer_directory): identidad propia de customers,
 * customer_id en reservas/pedidos y las RPC del directorio. Solo `pg` (sin supabase-js):
 * las RPC se ejercen directo y las fixtures se insertan como en el seed. Invariante en
 * cada escenario con puntos: customers.points_balance === sum(points_ledger).
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const pg2 = new Client({ connectionString: DB_URL }); // segunda conexión: carreras
let resourceId: string;

// Usuarios auth de prueba (persisten entre archivos; ids distintos a points/reschedule.itest).
const U1 = "e0000000-0000-4000-a000-000000000101";
const U2 = "e0000000-0000-4000-a000-000000000102";
const U_HOLDER = "e0000000-0000-4000-a000-000000000103";
const ACTOR = "e0000000-0000-4000-a000-0000000000aa"; // created_by del evento (columna sin FK)

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, " +
  "reschedules, booking_events, points_ledger, customers cascade";

const insertAuthUser = (id: string, email: string) =>
  pg.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
       $2, '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
     ) on conflict (id) do nothing`,
    [id, email],
  );

type Snapshot = {
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

/** Ficha insertada directo (fixture), sin pasar por las RPC. Devuelve el id. */
async function customer(c: {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  authUserId?: string | null;
}): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `insert into customers (id, name, email, phone, auth_user_id)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) returning id`,
    [c.id ?? null, c.name ?? null, c.email ?? null, c.phone ?? null, c.authUserId ?? null],
  );
  return rows[0].id;
}

let slot = 0;
/**
 * Reserva 'booking' + pedido pending_payment insertados directo (como el seed). Cada llamada
 * usa un slot horario distinto, dos semanas adelante (GiST anti-solape).
 */
async function booking(c: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
  amount?: number;
  status?: "held" | "confirmed" | "cancelled";
}): Promise<{ orderId: string; reservationId: string }> {
  slot += 1;
  const starts = new Date(Date.now() + (24 * 14 + slot) * 3_600_000);
  const ends = new Date(starts.getTime() + 3_600_000);
  const amount = c.amount ?? 9990;
  const net = Math.round(amount / 1.19);
  const status = c.status ?? "held";
  const o = await pg.query<{ id: string }>(
    `insert into orders (status, amount_clp, net_clp, tax_clp, customer_name, customer_email, customer_phone, customer_id)
       values ('pending_payment', $1, $2, $3, $4, $5, $6, $7) returning id`,
    [amount, net, amount - net, c.name ?? null, c.email ?? null, c.phone ?? null, c.customerId ?? null],
  );
  const r = await pg.query<{ id: string }>(
    `insert into reservations (resource_id, kind, status, starts_at, ends_at, expires_at, order_id,
                               customer_name, customer_email, customer_phone, customer_id)
       values ($1, 'booking', $2::reservation_status, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [
      resourceId,
      status,
      starts.toISOString(),
      ends.toISOString(),
      status === "held" ? new Date(Date.now() + 1_800_000).toISOString() : null,
      o.rows[0].id,
      c.name ?? null,
      c.email ?? null,
      c.phone ?? null,
      c.customerId ?? null,
    ],
  );
  return { orderId: o.rows[0].id, reservationId: r.rows[0].id };
}

/** confirm_payment directo: paid + confirmed + earn (si el email tiene ficha) + boleta. */
const pay = (orderId: string, paymentId: string) => pg.query("select confirm_payment($1, $2)", [orderId, paymentId]);

const snapshot = async (table: "orders" | "reservations", id: string): Promise<Snapshot> =>
  (
    await pg.query<Snapshot>(
      `select customer_id, customer_name, customer_email, customer_phone from ${table} where id=$1`,
      [id],
    )
  ).rows[0];

const balance = async (id: string) =>
  (await pg.query<{ b: number }>("select points_balance b from customers where id=$1", [id])).rows[0].b;
const ledgerSum = async (id: string) =>
  Number(
    (await pg.query<{ s: string }>("select coalesce(sum(amount),0)::text s from points_ledger where customer_id=$1", [id]))
      .rows[0].s,
  );
/** El invariante contable del sistema. */
const expectBalanceConsistent = async (id: string) => expect(await balance(id)).toBe(await ledgerSum(id));
const count = async (fromClause: string, params: unknown[] = []) =>
  Number((await pg.query<{ n: string }>(`select count(*)::text n from ${fromClause}`, params)).rows[0].n);

beforeAll(async () => {
  await pg.connect();
  await pg2.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(U1, "u1@dir.cl");
  await insertAuthUser(U2, "u2@dir.cl");
  await insertAuthUser(U_HOLDER, "titular@dir.cl");
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
  await pg2.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("esquema: identidad propia, constraints, phone_digits y customer_id", () => {
  it("una ficha ya no necesita usuario auth: id por default y FK a auth.users eliminada", async () => {
    const { rows } = await pg.query<{ id: string; auth_user_id: string | null }>(
      "insert into customers (email) values ('sin-auth@dir.cl') returning id, auth_user_id",
    );
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].auth_user_id).toBeNull();
  });

  it("phone_digits se deriva del teléfono ('+56 9 8123 4567' → '56981234567'); email opcional si hay teléfono", async () => {
    const { rows } = await pg.query<{ phone_digits: string | null; email: string | null }>(
      "insert into customers (name, phone) values ('Pía Contreras', '+56 9 8123 4567') returning phone_digits, email",
    );
    expect(rows[0]).toEqual({ phone_digits: "56981234567", email: null });
    const none = await pg.query<{ phone_digits: string | null }>(
      "insert into customers (email, phone) values ('sin-fono@dir.cl', null) returning phone_digits",
    );
    expect(none.rows[0].phone_digits).toBeNull();
  });

  it("constraints: minúsculas, contacto obligatorio, largo de nombre/teléfono, email único, auth_user_id único y con FK", async () => {
    await expect(pg.query("insert into customers (email) values ('MiXeD@dir.cl')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_email_lower",
    });
    await expect(pg.query("insert into customers (name) values ('Solo Nombre')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_contact_required",
    });
    await expect(
      pg.query("insert into customers (email, name) values ('largo@dir.cl', $1)", ["N".repeat(81)]),
    ).rejects.toMatchObject({ code: "23514", constraint: "customers_name_len" });
    await expect(pg.query("insert into customers (email, phone) values ('corto@dir.cl', '12345')")).rejects.toMatchObject({
      code: "23514",
      constraint: "customers_phone_len",
    });
    await pg.query("insert into customers (email) values ('unico@dir.cl')");
    await expect(pg.query("insert into customers (email) values ('unico@dir.cl')")).rejects.toMatchObject({
      code: "23505",
      constraint: "customers_email_key",
    });
    await expect(
      pg.query("insert into customers (email, auth_user_id) values ('fantasma@dir.cl', 'e0000000-0000-4000-a000-0000000000ff')"),
    ).rejects.toMatchObject({ code: "23503", constraint: "customers_auth_user_id_fkey" });
    await pg.query("insert into customers (email, auth_user_id) values ('u1@dir.cl', $1)", [U1]);
    await expect(
      pg.query("insert into customers (email, auth_user_id) values ('u1-bis@dir.cl', $1)", [U1]),
    ).rejects.toMatchObject({ code: "23505", constraint: "customers_auth_user_id_key" });
  });

  it("reservations/orders.customer_id: FK a customers con on delete set null; índices parciales presentes", async () => {
    const c = await customer({ name: "Link", email: "link@dir.cl" });
    const b = await booking({ name: "Link", email: "link@dir.cl", customerId: c });
    expect((await snapshot("orders", b.orderId)).customer_id).toBe(c);
    expect((await snapshot("reservations", b.reservationId)).customer_id).toBe(c);
    await pg.query("delete from customers where id=$1", [c]);
    expect((await snapshot("orders", b.orderId)).customer_id).toBeNull();
    expect((await snapshot("reservations", b.reservationId)).customer_id).toBeNull();
    const idx = await pg.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where indexname in ('customers_phone_digits_idx','customers_created_idx','reservations_customer_idx','orders_customer_idx')
        order by 1`,
    );
    expect(idx.rows.map((r) => r.indexname)).toEqual([
      "customers_created_idx",
      "customers_phone_digits_idx",
      "orders_customer_idx",
      "reservations_customer_idx",
    ]);
  });
});
```

- [ ] **Step 2: Write the failing booking-events test** — append to `src/infrastructure/db/booking-events.itest.ts` (after the last `describe`, line 166):

```ts

describe("booking_events — cliente", () => {
  it("customer_changed pasa el CHECK de tipo y cae en Reservas", async () => {
    const cat = await pg.query<{ c: string | null }>("select booking_event_category('customer_changed') c");
    expect(cat.rows[0].c).toBe("Reservas");
    const { reservationId } = await paidBooking(600, "bcc1");
    await pg.query("select log_booking_event($1, 'customer_changed', p_detail => $2::jsonb)", [
      reservationId,
      JSON.stringify({ from_name: "A", to_name: "B", points_moved: 0 }),
    ]);
    const e = await events(reservationId);
    expect(e.find((r) => r.type === "customer_changed")?.category).toBe("Reservas");
  });
});
```

- [ ] **Step 3: Run both files to verify they fail.**

Run: `npm run db:start` (if the stack is not up), then
`npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts src/infrastructure/db/booking-events.itest.ts`
Expected: FAIL — `null value in column "id"` / `column "phone_digits" does not exist` / `column "customer_id" of relation "orders" does not exist` in the directory file; `expected null to be 'Reservas'` in booking-events.

- [ ] **Step 4: Create the migration** `supabase/migrations/20260909120000_customer_directory.sql` with sections 1–6 (single backslashes in the regex, exactly as below):

```sql
-- Directorio de clientes (PR1, expand). Ver docs/superpowers/specs/2026-09-09-directorio-clientes-design.md.
--
-- customers deja de ser "una fila por login": gana identidad propia (id con default, FK a
-- auth.users reemplazada por auth_user_id nullable), email opcional (basta teléfono), y
-- reservations/orders ganan customer_id. Nada de esto lo usa el código vivo todavía: es
-- tolerado por el upsert-por-id actual y las funciones de puntos siguen resolviendo al
-- cliente por lower(orders.customer_email) = customers.email (byte-idénticas).
--
-- INVARIANTE (todos los escritores de customer_id, aquí y en PR3): quien escribe customer_id
-- reescribe customer_name/email/phone DESDE la ficha, así FK y join por email siempre coinciden.
--
-- Sin CHECK de forma de email en la tabla: un NOT VALID igual se evalúa en UPDATE y
-- apply_points actualiza customers → un email legacy raro abortaría pagos/reembolsos. La forma
-- la imponen los escritores (upsert_guest_customer, backfill, update_customer_contact, app).
--
-- Las funciones de abajo se DEFINEN pero no se ejecutan: el backfill corre en PR3.
-- Regex: UNA barra invertida (standard_conforming_strings = on).

-- ── 1. Guardas + normalización (nunca fusionar en silencio; normalizar antes de los CHECK) ──
do $$ begin
  if exists (select 1 from customers group by lower(trim(email)) having count(*) > 1) then
    raise exception 'customers: emails que difieren solo por mayúsculas/espacios; resolver a mano antes de migrar.';
  end if;
end $$;

update customers
   set email = lower(trim(email)),
       name  = nullif(left(trim(name), 80), ''),
       phone = case when char_length(trim(phone)) between 6 and 40 then trim(phone) end;

-- ── 2. Identidad propia sin renumerar (nombre del FK resuelto en pg_constraint, no asumido) ──
do $$
declare v_fk text;
begin
  select conname into v_fk from pg_constraint
    where conrelid = 'public.customers'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass;
  if v_fk is not null then
    execute format('alter table public.customers drop constraint %I', v_fk);
  end if;
end $$;

alter table customers alter column id set default gen_random_uuid();
alter table customers add column auth_user_id uuid unique references auth.users (id) on delete set null;
update customers c set auth_user_id = c.id
  where exists (select 1 from auth.users u where u.id = c.id);

-- ── 3. Email opcional + constraints (auditoría C6: customers_email_lower) ──
alter table customers alter column email drop not null;
alter table customers
  add constraint customers_email_lower      check (email is null or email = lower(email)),
  add constraint customers_contact_required check (email is not null or phone is not null),
  add constraint customers_name_len         check (name  is null or char_length(name)  between 1 and 80),
  add constraint customers_phone_len        check (phone is null or char_length(phone) between 6 and 40);

-- ── 4. phone_digits (búsqueda por dígitos) + índices ──
alter table customers add column phone_digits text generated always as
  (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored;
create index customers_phone_digits_idx on customers (phone_digits) where phone_digits is not null;
create index customers_created_idx on customers (created_at desc);

-- ── 5. customer_id en reservas y pedidos (nullable; on delete set null; índices parciales) ──
alter table reservations add column customer_id uuid references customers (id) on delete set null;
alter table orders       add column customer_id uuid references customers (id) on delete set null;
create index reservations_customer_idx on reservations (customer_id, starts_at desc) where customer_id is not null;
create index orders_customer_idx       on orders (customer_id) where customer_id is not null;

-- ── 6. booking_events aprende 'customer_changed' (constraint y categoría cambian JUNTOS,
--       como en 20260824120000_curso_dj.sql: log_booking_event aborta ante categoría null) ──
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check
  check (type in (
    'created', 'payment_confirmed', 'courtesy_confirmed', 'access_sent',
    'reschedule_moved', 'reschedule_charge_pending', 'reschedule_charge_paid',
    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
    'boleta_issued', 'boleta_emitted', 'nota_credito_issued', 'nota_credito_emitted',
    'points_earned', 'points_revoked', 'cancelled', 'refunded',
    'curso_session_scheduled', 'curso_session_moved', 'curso_session_cancelled',
    'customer_changed'));

create or replace function booking_event_category(p_type text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_type in ('created', 'courtesy_confirmed', 'reschedule_moved', 'cancelled',
                    'curso_session_scheduled', 'curso_session_moved',
                    'curso_session_cancelled', 'customer_changed') then 'Reservas'
    when p_type in ('payment_confirmed', 'reschedule_charge_pending', 'reschedule_charge_paid',
                    'reschedule_refund', 'reschedule_failed_slot_taken', 'reschedule_expired',
                    'refunded') then 'Pagos'
    when p_type in ('points_earned', 'points_revoked') then 'Puntos'
    when p_type in ('boleta_issued', 'boleta_emitted', 'nota_credito_issued',
                    'nota_credito_emitted') then 'Documentos tributarios'
    when p_type = 'access_sent' then 'Notificaciones'
  end
$$;
```

- [ ] **Step 5: Apply and verify the backslashes survived.** `npm run db:reset` → exit 0. Then `grep -n "regexp_replace" supabase/migrations/20260909120000_customer_directory.sql` must print `'\D'` with ONE backslash.

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts src/infrastructure/db/booking-events.itest.ts`
Expected: PASS (4 + 7 tests).

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts src/infrastructure/db/booking-events.itest.ts
git commit -m "feat(db): customer directory schema — own identity, customer_id links, customer_changed event" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `upsert_guest_customer` — the single guest writer

**Files:**
- Modify: `supabase/migrations/20260909120000_customer_directory.sql` (append section 7)
- Modify: `src/infrastructure/db/customers-directory.itest.ts` (append a describe)

**Interfaces:**
- Consumes: `customers_email_key` (unique on `email`) for `on conflict (email)`; `customers.auth_user_id` (Task 1).
- Produces: `upsert_guest_customer(p_name text, p_email text, p_phone text) returns uuid` — returns `null` unless the normalized email passes the shape gate; otherwise the id of the inserted/updated row. Typed values win for rows with `auth_user_id is null`; account holders keep name and email, only a NULL phone is filled. PR3's `create_checkout`, the courtesy path and the backfill call this.

- [ ] **Step 1: Write the failing tests** — append to `src/infrastructure/db/customers-directory.itest.ts`:

```ts

describe("upsert_guest_customer (escritor único de invitados)", () => {
  const upsert = async (name: string | null, email: string | null, phone: string | null) =>
    (await pg.query<{ id: string | null }>("select upsert_guest_customer($1, $2, $3) id", [name, email, phone])).rows[0].id;

  it("la puerta de forma acepta un email normal (normalizado) y devuelve null ante 'a@b' y otras basuras", async () => {
    const id = await upsert("  Matías Rojas ", " Matias.Rojas@Gmail.com ", "+56 9 8123 4567");
    expect(id).not.toBeNull();
    const row = await pg.query<{ name: string; email: string; phone: string; phone_digits: string }>(
      "select name, email, phone, phone_digits from customers where id=$1",
      [id],
    );
    expect(row.rows[0]).toEqual({
      name: "Matías Rojas",
      email: "matias.rojas@gmail.com",
      phone: "+56 9 8123 4567",
      phone_digits: "56981234567",
    });
    for (const bad of ["a@b", "", null, "sin-arroba.cl", "dos@@x.cl", "con espacio@x.cl", `${"a".repeat(116)}@x.cl`]) {
      expect(await upsert("X", bad, null)).toBeNull();
    }
    expect(await upsert("Y", `${"a".repeat(110)}@x.cl`, null)).not.toBeNull(); // 115 chars: dentro del tope 120
    expect(await count("customers")).toBe(2);
  });

  it("nombre vacío y teléfono fuera de 6–40 se guardan como null (basta el email)", async () => {
    const id = await upsert("   ", "solo-email@dir.cl", "123");
    const row = await pg.query<{ name: string | null; phone: string | null }>("select name, phone from customers where id=$1", [id]);
    expect(row.rows[0]).toEqual({ name: null, phone: null });
  });

  it("para fichas de invitado ganan los datos tipeados; los vacíos no pisan lo existente", async () => {
    const g = await upsert("Ana", "ana@dir.cl", "+56911111111");
    expect(await upsert("Ana María", "ANA@dir.cl", "+56922222222")).toBe(g);
    expect((await pg.query("select name, phone from customers where id=$1", [g])).rows[0]).toEqual({
      name: "Ana María",
      phone: "+56922222222",
    });
    expect(await upsert(null, "ana@dir.cl", null)).toBe(g);
    expect((await pg.query("select name, phone from customers where id=$1", [g])).rows[0]).toEqual({
      name: "Ana María",
      phone: "+56922222222",
    });
    expect(await count("customers")).toBe(1);
  });

  it("titular de cuenta: conserva nombre y email; solo se rellena un teléfono vacío", async () => {
    const h = await customer({ name: "Titular Real", email: "titular@dir.cl", phone: null, authUserId: U_HOLDER });
    expect(await upsert("Otro Nombre", "titular@dir.cl", "+56933333333")).toBe(h);
    expect((await pg.query("select name, phone from customers where id=$1", [h])).rows[0]).toEqual({
      name: "Titular Real",
      phone: "+56933333333",
    });
    expect(await upsert("Otro", "titular@dir.cl", "+56944444444")).toBe(h);
    expect((await pg.query<{ phone: string }>("select phone from customers where id=$1", [h])).rows[0].phone).toBe(
      "+56933333333", // ya tenía teléfono → no se pisa
    );
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "upsert_guest_customer"`
Expected: FAIL with `function upsert_guest_customer(text, text, text) does not exist`.

- [ ] **Step 3: Append section 7 to the migration:**

```sql

-- ── 7. upsert_guest_customer: ÚNICO escritor de fichas de invitado (checkout, cortesía, backfill) ──
-- Normaliza (lower/trim, topes), y sin email de forma válida no hay ficha → null (el pedido
-- queda sin vincular, como hoy). Con ficha existente: para invitados lo tipeado gana (teléfono y
-- nombre nuevos son la verdad más reciente para WhatsApp/MP); un titular de cuenta conserva
-- nombre y email y solo se le rellena un teléfono vacío.
create function upsert_guest_customer(p_name text, p_email text, p_phone text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_name  text := nullif(left(trim(p_name), 80), '');
  v_phone text := case when char_length(trim(p_phone)) between 6 and 40 then trim(p_phone) end;
  v_id    uuid;
begin
  if v_email is null
     or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
     or char_length(v_email) > 120 then
    return null;
  end if;

  insert into customers (email, name, phone) values (v_email, v_name, v_phone)
    on conflict (email) do update set
      name  = case when customers.auth_user_id is null
                   then coalesce(excluded.name, customers.name)
                   else customers.name end,
      phone = case when customers.auth_user_id is null
                   then coalesce(excluded.phone, customers.phone)
                   else coalesce(customers.phone, excluded.phone) end,
      updated_at = now()
    returning id into v_id;
  return v_id;
end;
$$;
```

- [ ] **Step 4: Apply and run.** `npm run db:reset` → then the same vitest command → Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts
git commit -m "feat(db): upsert_guest_customer — single guest writer with email shape gate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `ensure_customer_for_user` — login adopts or creates the directory row

**Files:**
- Modify: `supabase/migrations/20260909120000_customer_directory.sql` (append section 8)
- Modify: `src/infrastructure/db/customers-directory.itest.ts` (append a describe)

**Interfaces:**
- Consumes: `customers.auth_user_id` (unique), `customers_email_key`.
- Produces:
  - `customer_sync_snapshots(p_customer uuid, p_old_email text) returns void` — private helper (not called by the app): re-reads the `customers` row and rewrites `customer_id/customer_name/customer_email/customer_phone` on every order/reservation already linked to it (`customer_id = p_customer`) AND on the orphans (`customer_id is null`) whose `lower(customer_email)` is `p_old_email` or the row's current email. Raises `customer_not_found` if the row is gone. Called by `ensure_customer_for_user` (auth-email refresh) and by `update_customer_contact` (Task 5) — the one place where the snapshot invariant is enforced for email rewrites.
  - `ensure_customer_for_user(p_user uuid, p_email text) returns uuid` — order: (1) row with `auth_user_id = p_user` (refresh email if the auth email changed and is free — then `customer_sync_snapshots(v_id, <old email>)` so linked/orphan rows carry the new email — else raise `customer_email_owned_by_other_user`); (2) legacy row `id = p_user and auth_user_id is null` → claim it, then same refresh; (3) unclaimed row by email → adopt (set `auth_user_id`); (4) insert `id = p_user`; on PK/email race re-read, else raise. Raises `customer_user_required` on null `p_user` and `customer_email_required` on empty email (PR2 maps both; neither is reachable from a real session). PR2's `CustomerService.ensureCustomer` calls this.

- [ ] **Step 1: Write the failing tests** — append:

```ts

describe("ensure_customer_for_user (login → ficha)", () => {
  const ensure = async (user: string, email: string, client: Client = pg) =>
    (await client.query<{ id: string }>("select ensure_customer_for_user($1, $2) id", [user, email])).rows[0].id;

  it("adopta la ficha del directorio conservando su id (normaliza el email) y es idempotente", async () => {
    const guest = await customer({ name: "Uno", email: "u1@dir.cl", phone: "+56911111111" });
    expect(await ensure(U1, " U1@dir.cl ")).toBe(guest);
    expect((await pg.query("select auth_user_id, name from customers where id=$1", [guest])).rows[0]).toEqual({
      auth_user_id: U1,
      name: "Uno",
    });
    expect(await ensure(U1, "u1@dir.cl")).toBe(guest);
    expect(await count("customers")).toBe(1);
  });

  it("sin ficha previa crea una con id = usuario auth", async () => {
    expect(await ensure(U1, "u1@dir.cl")).toBe(U1);
    expect((await pg.query("select auth_user_id, email from customers where id=$1", [U1])).rows[0]).toEqual({
      auth_user_id: U1,
      email: "u1@dir.cl",
    });
  });

  it("reclama la fila legacy (id = usuario, auth_user_id null) aunque el email de auth haya cambiado", async () => {
    await customer({ id: U1, email: "viejo@dir.cl" }); // creada por el upsert-por-id anterior a PR2
    expect(await ensure(U1, "u1@dir.cl")).toBe(U1);
    expect((await pg.query("select auth_user_id, email from customers where id=$1", [U1])).rows[0]).toEqual({
      auth_user_id: U1,
      email: "u1@dir.cl",
    });
  });

  it("refresca el email si cambió en auth y está libre; si otra ficha lo tiene, levanta", async () => {
    await ensure(U1, "u1@dir.cl");
    await ensure(U1, "nuevo@dir.cl");
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [U1])).rows[0].email).toBe("nuevo@dir.cl");
    await customer({ name: "Otra", email: "ocupado@dir.cl" });
    await expect(ensure(U1, "ocupado@dir.cl")).rejects.toThrow("customer_email_owned_by_other_user");
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [U1])).rows[0].email).toBe("nuevo@dir.cl");
  });

  it("dos usuarios auth con el mismo email: el segundo levanta (nunca se fusiona)", async () => {
    await ensure(U1, "mismo@dir.cl");
    await expect(ensure(U2, "mismo@dir.cl")).rejects.toThrow("customer_email_owned_by_other_user");
    expect(await count("customers")).toBe(1);
  });

  it("email vacío levanta customer_email_required", async () => {
    await expect(ensure(U1, "  ")).rejects.toThrow("customer_email_required");
  });

  it("carrera: dos llamadas concurrentes del mismo usuario → una sola ficha", async () => {
    const [a, b] = await Promise.all([ensure(U1, "u1@dir.cl", pg), ensure(U1, "u1@dir.cl", pg2)]);
    expect(a).toBe(b);
    expect(await count("customers where auth_user_id=$1", [U1])).toBe(1);
  });

  it("al refrescar el email de auth propaga el snapshot: mark_refunded sigue revocando del MISMO cliente", async () => {
    const c = await customer({ name: "Uno", email: "u1@dir.cl", authUserId: U1 });
    const b = await booking({ name: "Uno", email: "u1@dir.cl", customerId: c });
    await pay(b.orderId, "ens1"); // earn 499 a c (join por email)
    expect(await balance(c)).toBe(499);
    expect(await ensure(U1, "nuevo@dir.cl")).toBe(c);
    const expected = { customer_id: c, customer_name: "Uno", customer_email: "nuevo@dir.cl", customer_phone: null };
    expect(await snapshot("orders", b.orderId)).toEqual(expected);
    expect(await snapshot("reservations", b.reservationId)).toEqual(expected);
    await pg.query("select mark_refunded($1, 'ens1-rf', null)", [b.orderId]);
    expect(await balance(c)).toBe(0);
    await expectBalanceConsistent(c);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "ensure_customer_for_user"`
Expected: FAIL with `function ensure_customer_for_user(uuid, text) does not exist`.

- [ ] **Step 3: Append section 8 to the migration** (the helper first — `update_customer_contact` in Task 5 calls it too):

```sql

-- ── 8. customer_sync_snapshots (helper privado) + ensure_customer_for_user: login → ficha ──
-- INVARIANTE para quien reescribe customers.email de una ficha que ya puede estar vinculada:
-- reescribe el snapshot (desde la ficha) en pedidos/reservas vinculados Y adopta+reescribe los
-- huérfanos que la join por email atribuía a esta ficha (email viejo o nuevo). Sin esto, tras
-- cambiar el email los pedidos pagados quedarían con el email viejo y mark_refunded /
-- reschedule_down / apply_reschedule_charge (join c.email = lower(o.customer_email)) revocarían
-- a nadie — o, si otra ficha tomara ese email, al cliente equivocado.
create function customer_sync_snapshots(p_customer uuid, p_old_email text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c customers%rowtype;
begin
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;

  update orders
     set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
   where customer_id = c.id
      or (customer_id is null and customer_email is not null
          and lower(customer_email) in (p_old_email, c.email));
  update reservations
     set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
   where customer_id = c.id
      or (customer_id is null and customer_email is not null
          and lower(customer_email) in (p_old_email, c.email));
end;
$$;

-- Orden: (1) ficha ya vinculada por auth_user_id (refresca el email si cambió en auth y está
-- libre — y propaga el snapshot con customer_sync_snapshots —; si otra ficha lo tiene, levanta:
-- fusionar es manual); (2) fila legacy id = usuario sin reclamar (creada por el upsert-por-id
-- vigente hasta PR2) → reclamarla; (3) ficha del directorio con ese email y sin dueño →
-- adoptarla conservando su id; (4) alta con id = usuario (paridad con el modelo anterior).
-- Carrera en (4): on conflict do nothing + relectura.
create function ensure_customer_for_user(p_user uuid, p_email text)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare
  v_email text := nullif(lower(trim(p_email)), '');
  v_id    uuid;
  v_cur   text;
begin
  if p_user is null then raise exception 'customer_user_required'; end if;
  if v_email is null then raise exception 'customer_email_required'; end if;

  -- (1) ya vinculada
  select id, email into v_id, v_cur from customers where auth_user_id = p_user;

  -- (2) fila legacy sin reclamar
  if v_id is null then
    update customers set auth_user_id = p_user, updated_at = now()
      where id = p_user and auth_user_id is null
      returning id, email into v_id, v_cur;
  end if;

  if v_id is not null then
    if v_cur is distinct from v_email then
      update customers set email = v_email, updated_at = now()
        where id = v_id and not exists (select 1 from customers where email = v_email);
      if not found then raise exception 'customer_email_owned_by_other_user'; end if;
      -- INVARIANTE: los pedidos/reservas ya vinculados (y los huérfanos del email viejo/nuevo)
      -- pasan a llevar el email nuevo; el claw-back sigue resolviendo a esta ficha.
      perform customer_sync_snapshots(v_id, v_cur);
    end if;
    return v_id;
  end if;

  -- (3) ficha del directorio (invitado/backfill) sin dueño → adoptar, id intacto
  update customers set auth_user_id = p_user, updated_at = now()
    where email = v_email and auth_user_id is null
    returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- (4) alta nueva; carrera → relectura
  insert into customers (id, email, auth_user_id) values (p_user, v_email, p_user)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from customers where auth_user_id = p_user;
    if v_id is null then raise exception 'customer_email_owned_by_other_user'; end if;
  end if;
  return v_id;
end;
$$;
```

- [ ] **Step 4: Apply and run.** `npm run db:reset` → same vitest command → Expected: PASS (8 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts
git commit -m "feat(db): ensure_customer_for_user — login adopts or creates the directory row; customer_sync_snapshots helper" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `backfill_customers_from_bookings` — idempotent directory backfill (defined, not executed)

**Files:**
- Modify: `supabase/migrations/20260909120000_customer_directory.sql` (append section 9)
- Modify: `src/infrastructure/db/customers-directory.itest.ts` (append a describe)

**Interfaces:**
- Consumes: `customers_email_key`, `reservations.customer_id`, `orders.customer_id`; `award_retro_points(p_customer uuid) returns int` and `mark_refunded(p_order uuid, p_refund_id text default null, p_refund_amount int default null)` (live, unchanged) for the claw-back test.
- Produces: `backfill_customers_from_bookings() returns int` — one customer per distinct `lower(customer_email)` (no trim; same key as the points joins) passing the shape gate; name and phone chosen independently, paid/fulfilled/refunded/confirmed rows first, then most recent; existing rows only get NULLs filled; links orders, reservations, and reservations via their order. Returns the number of **inserted** rows (`returning (xmax = 0)`), so a re-run returns 0. PR3 executes it and the seed calls it as a smoke.

- [ ] **Step 1: Write the failing tests** — append:

```ts

describe("backfill_customers_from_bookings (definido en PR1, se ejecuta en PR3)", () => {
  const backfill = async () => (await pg.query<{ n: number }>("select backfill_customers_from_bookings() n")).rows[0].n;

  it("una ficha por email en minúsculas; nombre/teléfono por independiente (pagada > abandonada, luego más reciente); sucias sin vincular; re-corrida → 0", async () => {
    // Mismo email con mayúsculas en dos pedidos: el pagado (viejo, nombre bueno) gana al abandonado (nuevo, nombre basura),
    // pero el abandonado aporta el teléfono porque el pagado no tiene.
    const paid = await booking({ name: "Matías Rojas", email: "MiXeD@Case.cl", phone: null });
    await pay(paid.orderId, "bf1");
    await pg.query("update orders set created_at = now() - interval '10 days' where id=$1", [paid.orderId]);
    await pg.query("update reservations set created_at = now() - interval '10 days' where id=$1", [paid.reservationId]);
    const abandoned = await booking({ name: "asdf", email: "mixed@case.cl", phone: "+56 9 1111 2222" });
    const padded = await booking({ name: "Padded", email: " padded@case.cl ", phone: null });
    const junk = await booking({ name: "Junk", email: "a@b", phone: null });
    const clamped = await booking({ name: "N".repeat(120), email: "largo@case.cl", phone: "123" }); // teléfono corto → null
    const inherit = await booking({ name: "Hereda", email: "hereda@case.cl", phone: null });
    await pg.query("update reservations set customer_email = null where id=$1", [inherit.reservationId]); // solo el pedido tiene email

    expect(await backfill()).toBe(3); // mixed@case.cl, largo@case.cl, hereda@case.cl

    const mixed = (await pg.query<{ id: string; name: string; phone: string }>("select id, name, phone from customers where email='mixed@case.cl'")).rows[0];
    expect(mixed).toMatchObject({ name: "Matías Rojas", phone: "+56 9 1111 2222" });
    expect((await pg.query("select name, phone from customers where email='largo@case.cl'")).rows[0]).toEqual({
      name: "N".repeat(80),
      phone: null,
    });

    // Vínculos: por email (pedido + reserva) y por herencia del pedido; las sucias quedan sin vincular y sin ficha.
    expect((await snapshot("orders", paid.orderId)).customer_id).toBe(mixed.id);
    expect((await snapshot("orders", abandoned.orderId)).customer_id).toBe(mixed.id);
    expect((await snapshot("reservations", paid.reservationId)).customer_id).toBe(mixed.id);
    expect((await snapshot("reservations", abandoned.reservationId)).customer_id).toBe(mixed.id);
    const hereda = (await pg.query<{ id: string }>("select id from customers where email='hereda@case.cl'")).rows[0].id;
    expect((await snapshot("reservations", inherit.reservationId)).customer_id).toBe(hereda);
    expect((await snapshot("orders", padded.orderId)).customer_id).toBeNull();
    expect((await snapshot("orders", junk.orderId)).customer_id).toBeNull();
    expect((await snapshot("orders", clamped.orderId)).customer_id).not.toBeNull();
    expect(await count("customers where email in (' padded@case.cl ', 'padded@case.cl', 'a@b')")).toBe(0);
    expect(await count("customers")).toBe(3);

    expect(await backfill()).toBe(0); // idempotente: nada nuevo que insertar ni vincular
    expect(await count("customers")).toBe(3);
  });

  it("una ficha existente (login) solo recibe los NULL rellenados; su nombre no se pisa", async () => {
    const existing = await customer({ name: "Ya Existe", email: "existe@case.cl", phone: null });
    const b = await booking({ name: "Otro Nombre", email: "EXISTE@case.cl", phone: "+56 9 3333 4444" });
    expect(await backfill()).toBe(0);
    expect((await pg.query("select name, phone from customers where id=$1", [existing])).rows[0]).toEqual({
      name: "Ya Existe",
      phone: "+56 9 3333 4444",
    });
    expect((await snapshot("orders", b.orderId)).customer_id).toBe(existing);
  });

  it("un pedido vinculado por el backfill se reembolsa con claw-back (retro → mark_refunded → 0)", async () => {
    const b = await booking({ name: "Retro", email: "retro@case.cl" });
    await pay(b.orderId, "bfr1"); // sin ficha → no gana en vivo
    expect(await count("points_ledger")).toBe(0);
    await backfill();
    const c = (await pg.query<{ id: string }>("select id from customers where email='retro@case.cl'")).rows[0].id;
    expect((await pg.query<{ n: number }>("select award_retro_points($1) n", [c])).rows[0].n).toBe(499); // lo que hará PR3
    await pg.query("select mark_refunded($1, 'bfr1-rf', null)", [b.orderId]);
    expect(await balance(c)).toBe(0);
    await expectBalanceConsistent(c);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "backfill_customers_from_bookings"`
Expected: FAIL with `function backfill_customers_from_bookings() does not exist`.

- [ ] **Step 3: Append section 9 to the migration:**

```sql

-- ── 9. backfill_customers_from_bookings: idempotente y re-ejecutable (PR3 lo corre) ──
-- MISMA clave que las joins de puntos: lower(email) SIN trim; la forma se valida con la misma
-- puerta que upsert_guest_customer. Nombre y teléfono se eligen por independiente: primero filas
-- pagadas/cumplidas/reembolsadas/confirmadas (los holds abandonados traen nombres basura), luego
-- la más reciente. Fichas existentes solo reciben NULLs rellenados. Devuelve las INSERTADAS
-- (xmax = 0 en RETURNING): row_count contaría también las actualizadas.
create function backfill_customers_from_bookings()
returns int language plpgsql set search_path = public, pg_temp as $$
declare v_inserted int;
begin
  with seen as (
    select lower(customer_email) as email,
           nullif(left(trim(customer_name), 80), '') as name,
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end as phone,
           case when status in ('paid', 'fulfilled', 'refunded') then 0 else 1 end as rk,
           created_at
      from orders where customer_email is not null
    union all
    select lower(customer_email),
           nullif(left(trim(customer_name), 80), ''),
           case when char_length(trim(customer_phone)) between 6 and 40 then trim(customer_phone) end,
           case when status = 'confirmed' then 0 else 1 end,
           created_at
      from reservations where kind = 'booking' and customer_email is not null
  ),
  valid as (
    select * from seen
      where email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 120
  ),
  best_name as (
    select distinct on (email) email, name from valid where name is not null
      order by email, rk, created_at desc
  ),
  best_phone as (
    select distinct on (email) email, phone from valid where phone is not null
      order by email, rk, created_at desc
  ),
  people as (select distinct email from valid),
  ins as (
    insert into customers (email, name, phone)
      select p.email, n.name, ph.phone
        from people p
        left join best_name  n  using (email)
        left join best_phone ph using (email)
      on conflict (email) do update set
        name       = coalesce(customers.name,  excluded.name),
        phone      = coalesce(customers.phone, excluded.phone),
        updated_at = now()
      returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_inserted from ins;

  -- Vínculos (INVARIANTE: el snapshot ya coincide con la ficha porque la clave ES el email).
  update orders o set customer_id = c.id from customers c
    where o.customer_id is null and o.customer_email is not null and c.email = lower(o.customer_email);
  update reservations r set customer_id = c.id from customers c
    where r.customer_id is null and r.customer_email is not null and c.email = lower(r.customer_email);
  update reservations r set customer_id = o.customer_id from orders o
    where r.order_id = o.id and r.customer_id is null and o.customer_id is not null;

  return v_inserted;
end;
$$;
```

- [ ] **Step 4: Apply and run.** `npm run db:reset` → same vitest command → Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts
git commit -m "feat(db): backfill_customers_from_bookings — idempotent directory backfill (defined, not run)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `update_customer_contact` — snapshot-propagating contact edit

**Files:**
- Modify: `supabase/migrations/20260909120000_customer_directory.sql` (append section 10)
- Modify: `src/infrastructure/db/customers-directory.itest.ts` (append a describe)

**Interfaces:**
- Consumes: `award_retro_points(uuid)`, `mark_refunded(...)` (live, unchanged); `customers.auth_user_id`; `customer_sync_snapshots(uuid, text)` (Task 3).
- Produces: `update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text) returns void` — normalizes (name ≤ 80, email lower/trim + shape gate, phone trimmed); raises `customer_not_found`, `customer_email_invalid`, `customer_has_account` (email change on an account holder), `customer_email_in_use` (clearing the email of a ficha that has any `points_ledger` row — its paid orders would lose the email the claw-back joins resolve; mirror of `customer_assign_needs_email`); 23505 `customers_email_key` and 23514 (`customers_contact_required` / `_name_len` / `_phone_len`) propagate for the app to map; rewrites snapshots on linked rows AND links+rewrites orphan rows whose `lower(customer_email)` matched the old or new email (via `customer_sync_snapshots`); then `award_retro_points` when the email is present. PR2's `/cuenta` profile edit and PR6's `/admin/clientes` edit both call this; PR6 maps `customer_email_in_use` to "Este cliente tiene puntos: necesita un email." (PR2 never hits it — `/cuenta` always resends the current email).

- [ ] **Step 1: Write the failing tests** — append:

```ts

describe("update_customer_contact (edición desde /admin/clientes y /cuenta/perfil)", () => {
  const update = (id: string, name: string | null, email: string | null, phone: string | null) =>
    pg.query("select update_customer_contact($1, $2, $3, $4)", [id, name, email, phone]);

  it("reescribe los snapshots vinculados y adopta+reescribe los huérfanos del email viejo o nuevo", async () => {
    const c = await customer({ name: "Cata", email: "cata@dir.cl", phone: null });
    const linked = await booking({ name: "Cata", email: "cata@dir.cl", phone: null, customerId: c });
    const orphanOld = await booking({ name: "Catalina", email: "CATA@dir.cl", phone: null }); // sin customer_id, email viejo
    const orphanNew = await booking({ name: "C. Soto", email: "catalina.soto@dir.cl", phone: null }); // sin customer_id, email nuevo
    const other = await booking({ name: "Otra", email: "otra@dir.cl", phone: null });

    await update(c, " Catalina Soto ", " Catalina.Soto@dir.cl ", "+56 9 7654 3210");

    const expected = { customer_id: c, customer_name: "Catalina Soto", customer_email: "catalina.soto@dir.cl", customer_phone: "+56 9 7654 3210" };
    for (const b of [linked, orphanOld, orphanNew]) {
      expect(await snapshot("orders", b.orderId)).toEqual(expected);
      expect(await snapshot("reservations", b.reservationId)).toEqual(expected);
    }
    expect((await snapshot("orders", other.orderId)).customer_id).toBeNull();
    expect((await pg.query("select name, email, phone from customers where id=$1", [c])).rows[0]).toEqual({
      name: "Catalina Soto",
      email: "catalina.soto@dir.cl",
      phone: "+56 9 7654 3210",
    });
  });

  it("titular de cuenta: cambiar el email levanta customer_has_account; nombre/teléfono sí se editan", async () => {
    const h = await customer({ name: "Titular", email: "titular@dir.cl", phone: null, authUserId: U_HOLDER });
    await expect(update(h, "Titular", "otro@dir.cl", null)).rejects.toThrow("customer_has_account");
    await expect(update(h, "Titular", null, "+56 9 1111 1111")).rejects.toThrow("customer_has_account");
    await update(h, "Titular Editado", "TITULAR@dir.cl", "+56 9 1111 1111"); // mismo email (normalizado) → ok
    expect((await pg.query("select name, email, phone from customers where id=$1", [h])).rows[0]).toEqual({
      name: "Titular Editado",
      email: "titular@dir.cl",
      phone: "+56 9 1111 1111",
    });
  });

  it("errores que la app mapea: ficha inexistente, email inválido, email ocupado (23505), sin contacto (23514)", async () => {
    const c = await customer({ name: "Uno", email: "uno@dir.cl" });
    await customer({ name: "Dos", email: "dos@dir.cl" });
    await expect(update("e0000000-0000-4000-a000-0000000000ff", "X", "x@dir.cl", null)).rejects.toThrow("customer_not_found");
    await expect(update(c, "Uno", "a@b", null)).rejects.toThrow("customer_email_invalid");
    await expect(update(c, "Uno", "dos@dir.cl", null)).rejects.toMatchObject({ code: "23505", constraint: "customers_email_key" });
    await expect(update(c, "Uno", null, null)).rejects.toMatchObject({ code: "23514", constraint: "customers_contact_required" });
    await expect(update(c, "Uno", "uno@dir.cl", "123")).rejects.toMatchObject({ code: "23514", constraint: "customers_phone_len" });
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [c])).rows[0].email).toBe("uno@dir.cl");
  });

  it("solo-teléfono que gana email: adopta el historial pagado de ese email y recibe retro", async () => {
    const c = await customer({ name: "Pía", email: null, phone: "+56 9 1234 5678" });
    const b = await booking({ name: "Pía", email: "pia@dir.cl", phone: null }); // pagó como invitada, sin ficha
    await pay(b.orderId, "ucc1");
    expect(await balance(c)).toBe(0);
    await update(c, "Pía", "pia@dir.cl", "+56 9 1234 5678");
    expect((await snapshot("orders", b.orderId)).customer_id).toBe(c);
    expect(await balance(c)).toBe(499); // floor(0.05·9990)
    await expectBalanceConsistent(c);
  });

  it("tras cambiar el email, mark_refunded revoca del MISMO cliente", async () => {
    const c = await customer({ name: "Cata", email: "cata@dir.cl" });
    const b = await booking({ name: "Cata", email: "cata@dir.cl", customerId: c });
    await pay(b.orderId, "ucr1"); // earn 499 a c (join por email)
    expect(await balance(c)).toBe(499);
    await update(c, "Cata", "nuevo@dir.cl", null);
    await pg.query("select mark_refunded($1, 'ucr1-rf', null)", [b.orderId]);
    expect(await balance(c)).toBe(0);
    await expectBalanceConsistent(c);
  });

  it("ficha con puntos: quitarle el email levanta customer_email_in_use; snapshot y saldo intactos", async () => {
    const c = await customer({ name: "Cata", email: "cata@dir.cl", phone: "+56 9 7654 3210" });
    const b = await booking({ name: "Cata", email: "cata@dir.cl", phone: "+56 9 7654 3210", customerId: c });
    await pay(b.orderId, "uce1"); // earn 499 a c
    expect(await balance(c)).toBe(499);
    await expect(update(c, "Cata", null, "+56 9 7654 3210")).rejects.toThrow("customer_email_in_use");
    expect((await pg.query<{ email: string }>("select email from customers where id=$1", [c])).rows[0].email).toBe("cata@dir.cl");
    expect((await snapshot("orders", b.orderId)).customer_email).toBe("cata@dir.cl");
    expect(await balance(c)).toBe(499);
    await expectBalanceConsistent(c);
    // Sin ledger sí se puede (queda solo-teléfono, como una ficha nueva del directorio).
    const d = await customer({ name: "Dani", email: "dani@dir.cl", phone: "+56 9 5555 5555" });
    await update(d, "Dani", null, "+56 9 5555 5555");
    expect((await pg.query<{ email: string | null }>("select email from customers where id=$1", [d])).rows[0].email).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "update_customer_contact"`
Expected: FAIL with `function update_customer_contact(uuid, text, text, text) does not exist`.

- [ ] **Step 3: Append section 10 to the migration:**

```sql

-- ── 10. update_customer_contact: edición (admin y /cuenta) que propaga el snapshot ──
-- Reescribe los snapshots vinculados Y adopta los huérfanos que la join por email ya atribuía a
-- esta ficha (email viejo o nuevo) vía customer_sync_snapshots, para que FK y join nunca
-- discrepen; luego retro por el historial del email nuevo (idempotente). Un titular de cuenta
-- no cambia su email aquí (es su acceso). Una ficha con puntos no puede quedarse sin email:
-- sus pedidos pagados perderían el email por el que mark_refunded/reschedule_* revocan (espejo
-- de customer_assign_needs_email). 23505 (customers_email_key) → 'email_taken' en la app;
-- 23514 → mensajes del parser.
create function update_customer_contact(p_customer uuid, p_name text, p_email text, p_phone text)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  c       customers%rowtype;
  v_name  text := nullif(left(trim(p_name), 80), '');
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(trim(p_phone), '');
begin
  select * into c from customers where id = p_customer for update;
  if c.id is null then raise exception 'customer_not_found'; end if;
  if v_email is not null
     and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 120) then
    raise exception 'customer_email_invalid';
  end if;
  if c.auth_user_id is not null and v_email is distinct from c.email then
    raise exception 'customer_has_account';
  end if;
  if v_email is null and c.email is not null
     and exists (select 1 from points_ledger where customer_id = c.id) then
    raise exception 'customer_email_in_use';
  end if;

  update customers
     set name = v_name, email = v_email, phone = v_phone, updated_at = now()
   where id = p_customer;

  -- INVARIANTE: snapshot desde la ficha en vinculados + huérfanos del email viejo/nuevo.
  perform customer_sync_snapshots(p_customer, c.email);

  if v_email is not null then perform award_retro_points(p_customer); end if;
end;
$$;
```

- [ ] **Step 4: Apply and run.** `npm run db:reset` → same vitest command → Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts
git commit -m "feat(db): update_customer_contact — snapshot-propagating contact edit" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `assign_booking_customer` — reassign a booking and move its earn

**Files:**
- Modify: `supabase/migrations/20260909120000_customer_directory.sql` (append section 11)
- Modify: `src/infrastructure/db/customers-directory.itest.ts` (append a describe)

**Interfaces:**
- Consumes: `log_booking_event(p_reservation uuid, p_type text, p_order uuid default null, p_reschedule uuid default null, p_tax_doc uuid default null, p_amount int default null, p_payment_ref text default null, p_detail jsonb default null, p_occurred_at timestamptz default null, p_created_by uuid default null) returns uuid`; `apply_points(p_customer uuid, p_order uuid, p_kind points_entry_kind, p_amount int, p_ref text default '') returns boolean` (`points_ledger_once (order_id, kind, ref)`; `adjust` requires `amount <> 0`); `award_retro_points(uuid)`; `reschedules.delta_order_id`; `create_reschedule_charge(p_reservation uuid, p_starts timestamptz, p_ends timestamptz, p_snapshot jsonb, p_lines jsonb, p_delta int, p_delta_net int, p_delta_tax int, p_created_by uuid default null) returns table(reschedule_id uuid, delta_order_id uuid)` (test fixture for the delta order).
- Produces: `assign_booking_customer(p_reservation uuid, p_customer uuid, p_created_by uuid default null) returns void` — raises `customer_assign_not_booking`, `customer_assign_inactive` (status not held/confirmed), `customer_not_found`, `customer_assign_points_order` (`points_redeemed_clp > 0` or any `redeem*` ledger row), `customer_assign_needs_email` (phone-only target on a paid/fulfilled/refunded order); no-op when already assigned. Rewrites snapshots on the reservation, its order and its delta orders; logs `customer_changed` with detail `{from_customer_id, from_name, from_email, to_customer_id, to_name, to_email, points_moved}`; moves each other customer's net (`earn + earn_revoke + adjust`, `having sum <> 0`) with an `adjust` pair (`reassign:{evt}:out:{cust}` / `reassign:{evt}:in:{cust}`); then `award_retro_points(new)` for paid orders. PR7's "Cambiar cliente" calls this.

- [ ] **Step 1: Write the failing tests** — append:

```ts

describe("assign_booking_customer (cambiar cliente)", () => {
  const assign = (reservationId: string, customerId: string, actor: string | null = ACTOR) =>
    pg.query("select assign_booking_customer($1, $2, $3)", [reservationId, customerId, actor]);
  const addHours = (iso: string, n: number) => new Date(Date.parse(iso) + n * 3_600_000).toISOString();
  const linesUp = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 12990, subtotal_clp: 12990 }]);
  const two = async () => ({
    A: await customer({ name: "A", email: "a@dir.cl", phone: "+56 9 1111 1111" }),
    B: await customer({ name: "B", email: "b@dir.cl", phone: "+56 9 2222 2222" }),
  });
  const paidByA = async (A: string) => {
    const b = await booking({ name: "A", email: "a@dir.cl", phone: "+56 9 1111 1111", customerId: A });
    await pay(b.orderId, `pay-${slot}`); // A gana floor(0.05·9990) = 499
    return b;
  };

  it("A→B: reescribe snapshots (reserva, pedido y pedido de delta), registra customer_changed y MUEVE el earn; balances == ledger", async () => {
    const { A, B } = await two();
    const b = await paidByA(A);
    const endsAt = (await pg.query<{ ends_at: string }>("select ends_at from reservations where id=$1", [b.reservationId])).rows[0].ends_at;
    const delta = await pg.query<{ delta_order_id: string }>(
      "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
      [b.reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesUp, 3000, 2521, 479, null],
    );

    await assign(b.reservationId, B);

    const snapB = { customer_id: B, customer_name: "B", customer_email: "b@dir.cl", customer_phone: "+56 9 2222 2222" };
    expect(await snapshot("reservations", b.reservationId)).toEqual(snapB);
    expect(await snapshot("orders", b.orderId)).toEqual(snapB);
    expect(await snapshot("orders", delta.rows[0].delta_order_id)).toEqual(snapB);
    expect(await balance(A)).toBe(0);
    expect(await balance(B)).toBe(499);
    await expectBalanceConsistent(A);
    await expectBalanceConsistent(B);

    const ev = await pg.query<{ category: string; created_by: string; order_id: string; detail: Record<string, unknown> }>(
      "select category, created_by, order_id, detail from booking_events where reservation_id=$1 and type='customer_changed'",
      [b.reservationId],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0]).toMatchObject({ category: "Reservas", created_by: ACTOR, order_id: b.orderId });
    expect(ev.rows[0].detail).toEqual({
      from_customer_id: A, from_name: "A", from_email: "a@dir.cl",
      to_customer_id: B, to_name: "B", to_email: "b@dir.cl", points_moved: 499,
    });
    const adj = await pg.query<{ customer_id: string; amount: number; ref: string }>(
      "select customer_id, amount, ref from points_ledger where order_id=$1 and kind='adjust' order by amount",
      [b.orderId],
    );
    expect(adj.rows.map((r) => [r.customer_id, r.amount])).toEqual([[A, -499], [B, 499]]);
    expect(adj.rows.every((r) => r.ref.startsWith("reassign:"))).toBe(true);
    expect(await count("points_ledger where order_id=$1 and kind='earn'", [b.orderId])).toBe(1); // el retro NO duplica el earn
  });

  it("A→B→A restaura a A; A→B→C deja a B en 0", async () => {
    const { A, B } = await two();
    const C = await customer({ name: "C", email: "c@dir.cl" });
    const b1 = await paidByA(A);
    await assign(b1.reservationId, B);
    await assign(b1.reservationId, A);
    expect(await balance(A)).toBe(499);
    expect(await balance(B)).toBe(0);

    const b2 = await paidByA(A);
    await assign(b2.reservationId, B);
    await assign(b2.reservationId, C);
    expect(await balance(A)).toBe(499); // solo b1
    expect(await balance(B)).toBe(0);
    expect(await balance(C)).toBe(499);
    for (const id of [A, B, C]) await expectBalanceConsistent(id);
  });

  it("misma ficha → no-op sin evento; ficha inexistente → customer_not_found", async () => {
    const { A } = await two();
    const b = await paidByA(A);
    await assign(b.reservationId, A);
    expect(await count("booking_events where reservation_id=$1 and type='customer_changed'", [b.reservationId])).toBe(0);
    await expect(assign(b.reservationId, "e0000000-0000-4000-a000-0000000000ff")).rejects.toThrow("customer_not_found");
  });

  it("pedido con canje de puntos → customer_assign_points_order (por points_redeemed_clp o por fila redeem*)", async () => {
    const { A, B } = await two();
    const b1 = await paidByA(A);
    await pg.query("update orders set points_redeemed_clp = 1000 where id=$1", [b1.orderId]);
    await expect(assign(b1.reservationId, B)).rejects.toThrow("customer_assign_points_order");

    const b2 = await paidByA(A);
    await pg.query("select apply_points($1, $2, 'redeem', -100, '')", [A, b2.orderId]);
    await expect(assign(b2.reservationId, B)).rejects.toThrow("customer_assign_points_order");
    expect((await snapshot("orders", b2.orderId)).customer_id).toBe(A);
  });

  it("ficha solo-teléfono: rechazada en pedido pagado (customer_assign_needs_email), aceptada en pendiente", async () => {
    const { A } = await two();
    const P = await customer({ name: "Pía", email: null, phone: "+56 9 1234 5678" });
    const paid = await paidByA(A);
    await expect(assign(paid.reservationId, P)).rejects.toThrow("customer_assign_needs_email");
    expect((await snapshot("orders", paid.orderId)).customer_id).toBe(A);

    const pending = await booking({ name: "A", email: "a@dir.cl", customerId: A });
    await assign(pending.reservationId, P);
    expect(await snapshot("orders", pending.orderId)).toEqual({ customer_id: P, customer_name: "Pía", customer_email: null, customer_phone: "+56 9 1234 5678" });
  });

  it("reserva cancelada → customer_assign_inactive; bloqueo → customer_assign_not_booking", async () => {
    const { A, B } = await two();
    const cancelled = await booking({ name: "A", email: "a@dir.cl", customerId: A, status: "cancelled" });
    await expect(assign(cancelled.reservationId, B)).rejects.toThrow("customer_assign_inactive");
    const block = await pg.query<{ id: string }>(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
         values ($1, 'block', 'confirmed', now() + interval '30 days', now() + interval '30 days 2 hours', 'Mantención') returning id`,
      [resourceId],
    );
    await expect(assign(block.rows[0].id, B)).rejects.toThrow("customer_assign_not_booking");
  });

  it("mark_refunded después de reasignar revoca del NUEVO cliente", async () => {
    const { A, B } = await two();
    const b = await paidByA(A);
    await assign(b.reservationId, B);
    await pg.query("select mark_refunded($1, 'asg-rf', null)", [b.orderId]);
    expect(await balance(A)).toBe(0);
    expect(await balance(B)).toBe(0);
    await expectBalanceConsistent(A);
    await expectBalanceConsistent(B);
    const revoke = await pg.query<{ customer_id: string; amount: number }>(
      "select customer_id, amount from points_ledger where order_id=$1 and kind='earn_revoke'",
      [b.orderId],
    );
    expect(revoke.rows).toEqual([{ customer_id: B, amount: -499 }]);
  });

  it("pedido pagado legacy sin ficha → el nuevo cliente gana el 5 % (retro), points_moved = 0", async () => {
    const C = await customer({ name: "C", email: "c@dir.cl" });
    const b = await booking({ name: "Legacy", email: "legacy@dir.cl" });
    await pay(b.orderId, "legacy1"); // nadie gana: no hay ficha para ese email
    expect(await count("points_ledger")).toBe(0);
    await assign(b.reservationId, C);
    expect((await snapshot("orders", b.orderId)).customer_email).toBe("c@dir.cl");
    expect(await balance(C)).toBe(499);
    await expectBalanceConsistent(C);
    const ev = await pg.query<{ detail: { points_moved: number; from_customer_id: string | null } }>(
      "select detail from booking_events where reservation_id=$1 and type='customer_changed'",
      [b.reservationId],
    );
    expect(ev.rows[0].detail).toMatchObject({ points_moved: 0, from_customer_id: null });
  });

  it("cortesía (sin pedido): reescribe solo la reserva y registra el evento sin puntos", async () => {
    const { B } = await two();
    const r = await pg.query<{ id: string }>(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name, customer_email)
         values ($1, 'booking', 'confirmed', now() + interval '31 days', now() + interval '31 days 1 hour', 'Walk-in', null) returning id`,
      [resourceId],
    );
    await assign(r.rows[0].id, B, null);
    expect(await snapshot("reservations", r.rows[0].id)).toEqual({ customer_id: B, customer_name: "B", customer_email: "b@dir.cl", customer_phone: "+56 9 2222 2222" });
    expect(await count("booking_events where reservation_id=$1 and type='customer_changed'", [r.rows[0].id])).toBe(1);
    expect(await count("points_ledger")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts -t "assign_booking_customer"`
Expected: FAIL with `function assign_booking_customer(uuid, uuid, uuid) does not exist`.

- [ ] **Step 3: Append section 11 to the migration:**

```sql

-- ── 11. assign_booking_customer: cambiar el cliente de una reserva vigente ──
-- El ledger es append-only → el earn neto de cada otro cliente se MUEVE con un par 'adjust'
-- (ref única por evento y origen). Netear también los 'adjust' hace que A→B→A restaure a A y
-- A→B→C deje a B en 0. Como el snapshot pasa a llevar el email del nuevo cliente, el claw-back
-- de mark_refunded/reschedule_* (que suma earn+earn_revoke sin mirar cliente y revoca al que
-- resuelve el email) cae sobre quien tiene el neto. Canjes: rechazados (misma postura que
-- reschedule). Ficha solo-teléfono: rechazada en pedidos pagados para que un claw-back futuro
-- siempre encuentre al titular.
create function assign_booking_customer(p_reservation uuid, p_customer uuid, p_created_by uuid default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  r       reservations%rowtype;
  c       customers%rowtype;
  o       orders%rowtype;
  v_evt   uuid;
  v_moved int := 0;
  v_paid  boolean := false;
  m       record;
begin
  select * into r from reservations where id = p_reservation for update;
  if r.id is null or r.kind <> 'booking' then raise exception 'customer_assign_not_booking'; end if;
  if r.status not in ('held', 'confirmed') then raise exception 'customer_assign_inactive'; end if;

  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'customer_not_found'; end if;
  if r.customer_id = p_customer then return; end if;   -- no-op: sin evento ni movimientos

  if r.order_id is not null then
    select * into o from orders where id = r.order_id for update;
    if o.points_redeemed_clp > 0 or exists (
         select 1 from points_ledger
          where order_id = r.order_id and kind in ('redeem', 'redeem_release', 'redeem_restore')) then
      raise exception 'customer_assign_points_order';
    end if;
    v_paid := o.status in ('paid', 'fulfilled', 'refunded');
    if v_paid and c.email is null then raise exception 'customer_assign_needs_email'; end if;
    select coalesce(sum(amount), 0) into v_moved from points_ledger
      where order_id = r.order_id and kind in ('earn', 'earn_revoke', 'adjust') and customer_id <> c.id;
  end if;

  -- INVARIANTE: snapshot desde la ficha (reserva, pedido y pedidos de delta del reagendamiento).
  update reservations
     set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
   where id = r.id;
  if r.order_id is not null then
    update orders
       set customer_id = c.id, customer_name = c.name, customer_email = c.email, customer_phone = c.phone
     where id = r.order_id
        or id in (select delta_order_id from reschedules
                   where reservation_id = r.id and delta_order_id is not null);
  end if;

  v_evt := log_booking_event(r.id, 'customer_changed', p_order => r.order_id, p_created_by => p_created_by,
    p_detail => jsonb_build_object(
      'from_customer_id', r.customer_id, 'from_name', r.customer_name, 'from_email', r.customer_email,
      'to_customer_id', c.id, 'to_name', c.name, 'to_email', c.email, 'points_moved', v_moved));

  if r.order_id is not null then
    for m in
      select customer_id, sum(amount)::int as net from points_ledger
       where order_id = r.order_id and kind in ('earn', 'earn_revoke', 'adjust') and customer_id <> c.id
       group by customer_id having sum(amount) <> 0
    loop
      perform apply_points(m.customer_id, r.order_id, 'adjust', -m.net, 'reassign:' || v_evt || ':out:' || m.customer_id);
      perform apply_points(c.id,          r.order_id, 'adjust',  m.net, 'reassign:' || v_evt || ':in:'  || m.customer_id);
    end loop;
    -- Pagada sin earn previo (sin ficha o email inválido al pagar) → 5 % al nuevo cliente.
    -- No-op cuando (order, 'earn', '') ya existe (points_ledger_once).
    if v_paid then perform award_retro_points(c.id); end if;
  end if;
end;
$$;
```

- [ ] **Step 4: Apply and run.** `npm run db:reset` → same vitest command → Expected: PASS (9 tests). Then the whole file: `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts` → PASS (34 tests: 4 + 4 + 8 + 3 + 6 + 9).

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20260909120000_customer_directory.sql src/infrastructure/db/customers-directory.itest.ts
git commit -m "feat(db): assign_booking_customer — reassign a booking and move its earn" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Seed — demo directory, account holder Felipe, links, retro, backfill smoke

**Files:**
- Modify: `supabase/seed.sql:42-48` (declare + auth user + customers), `:50-78` (orders), `:80-112` (reservations), after `:133` (retro + smoke)

**Interfaces:**
- Consumes: `customers.auth_user_id`, `orders.customer_id`, `reservations.customer_id` (Task 1); `award_retro_points(uuid)` (live); `backfill_customers_from_bookings()` (Task 4).
- Produces: customers `…f1, …f2, …f4, …f5, …f6` = Matías/Catalina/Valentina/Ignacio/Camila (lowercase emails, phones as typed in the demo orders), `…f7` = Pía Contreras (phone-only, `'+56912345678'` as in the spec); auth user + identity `…00a3` = `felipe.munoz@outlook.cl` whose customers row is **`id = auth_user_id = …00a3`** (exactly like every production account-holder row today, so the live `upsert({id, email}, onConflict id)` is a no-op update and `/cuenta` login works locally already in PR1; PR2's `ensure_customer_for_user` step (1) finds him by `auth_user_id`); every demo order/reservation linked; balances f1 1999 · f2 1499 · a3 4498 · f4 999. The super admin (`…00a1`) and staff (`…00a2`) get **no** customers row (only `/cuenta` logins do, via `ensure_customer_for_user` from PR2).

- [ ] **Step 1: Write the check first (it fails against the current seed).** Save this as `/tmp/seed-check.mjs`. It must be run **from the repo root as an eval** — `node /tmp/seed-check.mjs` fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` because ESM resolves bare specifiers relative to the importing file (`/tmp` has no `node_modules`), while `--eval` resolves them from the cwd:

```js
import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54422/postgres" });
await c.connect();
const bal = (await c.query("select right(id::text, 2) k, points_balance b, auth_user_id from customers order by id")).rows;
const links = (await c.query(
  "select (select count(*)::int from orders where customer_id is null) o, (select count(*)::int from reservations where kind='booking' and customer_id is null) r",
)).rows[0];
console.log(JSON.stringify({ bal, links }));
await c.end();
```

Run (from the repo root): `npm run db:reset && node --input-type=module -e "$(cat /tmp/seed-check.mjs)"`
Expected NOW: `{"bal":[],"links":{"o":6,"r":6}}` (no customers, nothing linked).

- [ ] **Step 2: Edit the declare block and add Felipe's auth user + the customers.** In `supabase/seed.sql`, replace lines 42–48

```sql
declare
  v_res    uuid;   -- recurso único (sala)
  v_staff  uuid;   -- rol staff
  v_suid   uuid := '00000000-0000-0000-0000-0000000000a2';  -- usuario auth staff
begin
  select id into v_res from resources limit 1;
  select id into v_staff from admin_roles where key = 'staff';
```

with

```sql
declare
  v_res    uuid;   -- recurso único (sala)
  v_staff  uuid;   -- rol staff
  v_suid   uuid := '00000000-0000-0000-0000-0000000000a2';  -- usuario auth staff
  v_cuid   uuid := '00000000-0000-0000-0000-0000000000a3';  -- usuario auth del cliente demo con cuenta (Felipe)
begin
  select id into v_res from resources limit 1;
  select id into v_staff from admin_roles where key = 'staff';

  -- ── Cliente con cuenta (auth + identidad) — ANTES de customers (FK auth_user_id) ──
  -- Login local: /cuenta/login con felipe.munoz@outlook.cl → magic link en Mailpit (:54424).
  -- Su ficha lleva id = auth_user_id = v_cuid, como toda fila de titular creada antes del
  -- directorio: el upsert-por-id vigente (hasta PR2) la actualiza sin chocar con el email.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_cuid, 'authenticated', 'authenticated',
    'felipe.munoz@outlook.cl', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_cuid::text, v_cuid,
    jsonb_build_object('sub', v_cuid::text, 'email', 'felipe.munoz@outlook.cl', 'email_verified', true),
    'email', now(), now(), now()
  ) on conflict do nothing;

  -- ── Clientes (directorio) — ANTES de pedidos/reservas (FK customer_id) ──
  -- Emails en minúsculas (customers_email_lower); teléfonos como se tipean (phone_digits los deriva).
  -- Felipe (titular) usa v_cuid como id (= auth_user_id); los invitados llevan ids …f1, …f2, …f4..f7.
  -- …f7 es solo-teléfono (sin email → sin puntos hasta que se le agregue uno).
  insert into customers (id, email, name, phone, auth_user_id) values
    ('00000000-0000-0000-0000-0000000000f1','matias.rojas@gmail.com',   'Matías Rojas',   '+56 9 8123 4567', null),
    ('00000000-0000-0000-0000-0000000000f2','catalina.soto@gmail.com',  'Catalina Soto',  '+56 9 7654 3210', null),
    (v_cuid,                                'felipe.munoz@outlook.cl',  'Felipe Muñoz',   '+56 9 9988 7766', v_cuid),
    ('00000000-0000-0000-0000-0000000000f4','valentina.diaz@gmail.com', 'Valentina Díaz', '+56 9 6543 2109', null),
    ('00000000-0000-0000-0000-0000000000f5','ignacio.fuentes@gmail.com','Ignacio Fuentes','+56 9 5512 3344', null),
    ('00000000-0000-0000-0000-0000000000f6','camila.vera@gmail.com',    'Camila Vera',    '+56 9 4433 2211', null),
    ('00000000-0000-0000-0000-0000000000f7', null,                      'Pía Contreras',  '+56912345678',    null)
  on conflict (id) do nothing;
```

- [ ] **Step 3: Add `customer_id` to the demo orders.** Replace the whole `insert into orders …` statement (lines 50–78, from `-- ── Pedidos` through `on conflict (id) do nothing;`) with:

```sql
  -- ── Pedidos (snapshot/monto congelados; net+tax=amount, IVA 19% incluido) ──
  -- INVARIANTE: customer_id + snapshot copiados de la ficha (mismo nombre/email/teléfono).
  insert into orders (id, status, currency, amount_clp, net_clp, tax_clp,
                      customer_name, customer_email, customer_phone, pricing_snapshot,
                      mp_payment_id, paid_at, created_at, customer_id) values
    -- 1) próxima, pagada
    ('00000000-0000-0000-0000-0000000000c1','paid','CLP',39980,33597,6383,
     'Matías Rojas','matias.rojas@gmail.com','+56 9 8123 4567',
     '{"tier":"puntaSemana","hours":2}'::jsonb,'mp_demo_0001', now() - interval '2 days', now() - interval '2 days',
     '00000000-0000-0000-0000-0000000000f1'),
    -- 2) próxima, pagada
    ('00000000-0000-0000-0000-0000000000c2','paid','CLP',29980,25193,4787,
     'Catalina Soto','catalina.soto@gmail.com','+56 9 7654 3210',
     '{"tier":"valle","hours":2}'::jsonb,'mp_demo_0002', now() - interval '1 day', now() - interval '1 day',
     '00000000-0000-0000-0000-0000000000f2'),
    -- 3) próxima, pagada, con addon audio+video
    ('00000000-0000-0000-0000-0000000000c3','paid','CLP',89970,75605,14365,
     'Felipe Muñoz','felipe.munoz@outlook.cl','+56 9 9988 7766',
     '{"tier":"puntaSemana","hours":2,"addons":["audioVideo"]}'::jsonb,'mp_demo_0003', now() - interval '3 hours', now() - interval '3 hours',
     v_cuid),
    -- 4) pasada, cumplida
    ('00000000-0000-0000-0000-0000000000c4','fulfilled','CLP',19980,16790,3190,
     'Valentina Díaz','valentina.diaz@gmail.com','+56 9 6543 2109',
     '{"tier":"valle","hours":2}'::jsonb,'mp_demo_0004', now() - interval '5 days', now() - interval '5 days',
     '00000000-0000-0000-0000-0000000000f4'),
    -- 5) pendiente de pago (hold activo)
    ('00000000-0000-0000-0000-0000000000c5','pending_payment','CLP',19990,16798,3192,
     'Ignacio Fuentes','ignacio.fuentes@gmail.com','+56 9 5512 3344',
     '{"tier":"puntaSemana","hours":1}'::jsonb, null, null, now(),
     '00000000-0000-0000-0000-0000000000f5'),
    -- 6) cancelada
    ('00000000-0000-0000-0000-0000000000c6','cancelled','CLP',14990,12597,2393,
     'Camila Vera','camila.vera@gmail.com','+56 9 4433 2211',
     '{"tier":"valle","hours":1}'::jsonb, null, null, now() - interval '1 day',
     '00000000-0000-0000-0000-0000000000f6')
  on conflict (id) do nothing;
```

- [ ] **Step 4: Add `customer_id` to the demo reservations.** Replace the whole `insert into reservations …` statement (lines 80–112) with:

```sql
  -- ── Reservas (UTC; ancladas a la tz de la locación) ──
  insert into reservations (id, resource_id, kind, status, starts_at, ends_at, expires_at,
                            order_id, customer_name, customer_email, customer_phone, notes, customer_id) values
    ('00000000-0000-0000-0000-0000000000b1', v_res,'booking','confirmed',
     ((current_date+1)+time '18:00') at time zone 'America/Santiago',
     ((current_date+1)+time '20:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c1','Matías Rojas','matias.rojas@gmail.com','+56 9 8123 4567', null,
     '00000000-0000-0000-0000-0000000000f1'),
    ('00000000-0000-0000-0000-0000000000b2', v_res,'booking','confirmed',
     ((current_date+2)+time '16:00') at time zone 'America/Santiago',
     ((current_date+2)+time '18:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c2','Catalina Soto','catalina.soto@gmail.com','+56 9 7654 3210', null,
     '00000000-0000-0000-0000-0000000000f2'),
    ('00000000-0000-0000-0000-0000000000b3', v_res,'booking','confirmed',
     ((current_date+4)+time '20:00') at time zone 'America/Santiago',
     ((current_date+4)+time '22:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c3','Felipe Muñoz','felipe.munoz@outlook.cl','+56 9 9988 7766','Sesión con grabación audio + video',
     v_cuid),
    ('00000000-0000-0000-0000-0000000000b4', v_res,'booking','confirmed',
     ((current_date-5)+time '15:00') at time zone 'America/Santiago',
     ((current_date-5)+time '17:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c4','Valentina Díaz','valentina.diaz@gmail.com','+56 9 6543 2109', null,
     '00000000-0000-0000-0000-0000000000f4'),
    ('00000000-0000-0000-0000-0000000000b5', v_res,'booking','held',
     ((current_date+3)+time '19:00') at time zone 'America/Santiago',
     ((current_date+3)+time '20:00') at time zone 'America/Santiago', now() + interval '30 minutes',
     '00000000-0000-0000-0000-0000000000c5','Ignacio Fuentes','ignacio.fuentes@gmail.com','+56 9 5512 3344', null,
     '00000000-0000-0000-0000-0000000000f5'),
    ('00000000-0000-0000-0000-0000000000b6', v_res,'booking','cancelled',
     ((current_date+1)+time '12:00') at time zone 'America/Santiago',
     ((current_date+1)+time '13:00') at time zone 'America/Santiago', null,
     '00000000-0000-0000-0000-0000000000c6','Camila Vera','camila.vera@gmail.com','+56 9 4433 2211','Cancelada por la clienta',
     '00000000-0000-0000-0000-0000000000f6'),
    -- 7) bloqueo administrativo (sin pedido, sin cliente)
    ('00000000-0000-0000-0000-0000000000b7', v_res,'block','confirmed',
     ((current_date+6)+time '09:00') at time zone 'America/Santiago',
     ((current_date+6)+time '13:00') at time zone 'America/Santiago', null,
     null, null, null, null, 'Mantención de equipos', null)
  on conflict (id) do nothing;
```

- [ ] **Step 5: Retro + backfill smoke.** Insert right after the `tax_documents` insert's `on conflict (id) do nothing;` (line 133) and before `-- ── Miembro staff`:

```sql

  -- ── Puntos: retro por el historial pagado (1.999 / 1.499 / 4.498 / 999); idempotente ──
  perform award_retro_points('00000000-0000-0000-0000-0000000000f1');
  perform award_retro_points('00000000-0000-0000-0000-0000000000f2');
  perform award_retro_points(v_cuid);   -- Felipe
  perform award_retro_points('00000000-0000-0000-0000-0000000000f4');

  -- Smoke de idempotencia del backfill (PR3 lo ejecuta en prod): el demo ya está todo
  -- vinculado y con ficha → no debe insertar nada. Si inserta, el seed falla a propósito.
  if backfill_customers_from_bookings() <> 0 then
    raise exception 'seed: backfill_customers_from_bookings debería ser no-op sobre el demo';
  end if;
```

- [ ] **Step 6: Reset and check.**

Run (from the repo root): `npm run db:reset && node --input-type=module -e "$(cat /tmp/seed-check.mjs)"`
Expected (`order by id` puts Felipe's `…00a3` first): `{"bal":[{"k":"a3","b":4498,"auth_user_id":"00000000-0000-0000-0000-0000000000a3"},{"k":"f1","b":1999,"auth_user_id":null},{"k":"f2","b":1499,"auth_user_id":null},{"k":"f4","b":999,"auth_user_id":null},{"k":"f5","b":0,"auth_user_id":null},{"k":"f6","b":0,"auth_user_id":null},{"k":"f7","b":0,"auth_user_id":null}],"links":{"o":0,"r":0}}`. Also re-run the directory itest file (it must still pass; it wipes and does not depend on the seed): `npx vitest run --config vitest.integration.config.ts src/infrastructure/db/customers-directory.itest.ts` → PASS, then `npm run db:reset` again.

- [ ] **Step 7: Commit.**

```bash
git add supabase/seed.sql
git commit -m "chore(seed): demo customers, account holder felipe, customer_id links, retro and backfill smoke" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Regenerate DB types; `CustomerProfile.email` becomes nullable

**Files:**
- Regenerate: `src/infrastructure/db/database.types.ts`
- Modify: `src/application/ports/customers.ts:3-9`
- Verify unchanged: `src/infrastructure/db/customer-repository.ts:34` (compiles as-is once the port is widened)

**Interfaces:**
- Consumes: the migrated local schema (Tasks 1–6).
- Produces: `Database["public"]["Tables"]["customers"]["Row"]` gains `auth_user_id: string | null`, `phone_digits: string | null`, and `email: string | null`; `Insert` has `id?: string`, `email?: string | null`, `auth_user_id?: string | null`; `orders`/`reservations` gain `customer_id: string | null` plus a `*_customer_id_fkey` relationship; `Functions` gain `assign_booking_customer`, `backfill_customers_from_bookings`, `customer_sync_snapshots` (private helper — never called from the app), `ensure_customer_for_user`, `update_customer_contact`, `upsert_guest_customer`. `CustomerProfile.email: string | null`. PR2 builds on exactly these names.

- [ ] **Step 1: Regenerate and observe the type error (the "failing test").**

Run: `npm run db:reset && npm run db:types && git diff --stat src/infrastructure/db/database.types.ts && npx tsc --noEmit`
Expected: the diff touches only `database.types.ts` (the `customers`, `orders`, `reservations` blocks and the six new `Functions` entries — five RPCs plus `customer_sync_snapshots`); `tsc` FAILS at `src/infrastructure/db/customer-repository.ts(34,…)`: `Type 'string | null' is not assignable to type 'string'`.

- [ ] **Step 2: Widen the port.** In `src/application/ports/customers.ts` replace lines 3–9

```ts
export interface CustomerProfile {
  id: string; // auth.users.id
  email: string;
  name: string | null;
  phone: string | null;
  pointsBalance: number;
}
```

with

```ts
export interface CustomerProfile {
  id: string; // customers.id (== auth.users.id para cuentas creadas antes del directorio; PR2 agrega authUserId)
  email: string | null; // null = ficha solo-teléfono del directorio (nunca para titulares de cuenta)
  name: string | null;
  phone: string | null;
  pointsBalance: number;
}
```

No change is needed in `customer-repository.ts:34` (`email: data.email` now maps `string | null` → `string | null`); `grep -rn "profile.email\|\.email ===" app src --include=*.ts --include=*.tsx` shows no consumer of `CustomerProfile.email` (`/cuenta` and `/reservar` use `session.email`).

- [ ] **Step 3: Verify.** `npx tsc --noEmit` → exit 0; `npm test` → green (unit tests do not touch the DB); `npx eslint .` → exit 0.

- [ ] **Step 4: Commit.**

```bash
git add src/infrastructure/db/database.types.ts src/application/ports/customers.ts
git commit -m "chore(db): regenerate types for the customer directory; CustomerProfile.email is nullable" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Cleanup strings — truncate `customers` wherever `reservations, orders` are truncated

**Files (each edit adds `, customers` before ` cascade` on the quoted line):**

| File | Line(s) | Before → After |
|---|---|---|
| `src/infrastructure/db/webhook.itest.ts` | 67 | `…, payment_intents, webhook_events cascade"` → `…, payment_intents, webhook_events, customers cascade"` |
| `src/infrastructure/db/tax.itest.ts` | 22 | `…, order_lines, tax_documents cascade"` → `…, order_lines, tax_documents, customers cascade"` |
| `src/infrastructure/db/tax-reversal.itest.ts` | 72 | `…, tax_documents, reschedules cascade"` → `…, tax_documents, reschedules, customers cascade"` |
| `src/infrastructure/db/reservas-list.itest.ts` | 31 | `…, tax_documents, payment_intents cascade"` → `…, tax_documents, payment_intents, customers cascade"` |
| `src/infrastructure/db/admin.itest.ts` | 37 | `"reservations, orders, order_lines, tax_documents, payment_intents cascade";` → `"reservations, orders, order_lines, tax_documents, payment_intents, customers cascade";` |
| `src/infrastructure/db/course-sessions.itest.ts` | 64, 71 | `"truncate reservations, orders, order_lines cascade"` → `"truncate reservations, orders, order_lines, customers cascade"` |
| `src/infrastructure/db/booking-routes.itest.ts` | 18 | `…, order_lines, payment_intents cascade"` → `…, order_lines, payment_intents, customers cascade"` |
| `src/infrastructure/db/course-billing.itest.ts` | 53, 60 | `"truncate reservations, orders, order_lines, tax_documents cascade"` → `"truncate reservations, orders, order_lines, tax_documents, customers cascade"` |
| `src/infrastructure/db/availability.itest.ts` | 33, 37 | `"truncate reservations, orders, order_lines cascade"` → `"truncate reservations, orders, order_lines, customers cascade"` |
| `src/infrastructure/db/notifications.itest.ts` | 32 | `"truncate reservations, orders, order_lines cascade"` → `"truncate reservations, orders, order_lines, customers cascade"` |
| `src/infrastructure/db/manual-pending.itest.ts` | 24 | `…, tax_documents, reschedules cascade"` → `…, tax_documents, reschedules, customers cascade"` |
| `src/infrastructure/db/booking-events.itest.ts` | 73 | `…, reschedules, booking_events cascade"` → `…, reschedules, booking_events, customers cascade"` |
| `src/infrastructure/db/pricing-checkout.itest.ts` | 34, 39 | `"truncate reservations, orders, order_lines cascade"` → `"truncate reservations, orders, order_lines, customers cascade"` |
| `src/infrastructure/db/reschedule.itest.ts` | 82 | `…, tax_documents, reschedules cascade"` → `…, tax_documents, reschedules, customers cascade"` |
| `src/infrastructure/payments/mercadopago/mercadopago.itest.ts` | 31, 35 | `"truncate reservations, orders, order_lines, payment_intents cascade"` → `"truncate reservations, orders, order_lines, payment_intents, customers cascade"` |

Do NOT touch `points.itest.ts` (already truncates `customers`), nor `applications`, `course`, `course-leads`, `rate-limit` (they never truncate reservations/orders — `truncate customers cascade` would now wipe reservations/orders under them).

**Interfaces:**
- Consumes: the new FKs `reservations.customer_id`/`orders.customer_id` → `customers` (so `truncate customers cascade` reaches reservations/orders/points_ledger, which these files already truncate; nothing new is wiped).
- Produces: every itest that clears bookings also clears directory rows (from the seed today; from `create_checkout` after PR3), so no `customers_email_key` collision can leak between files.

- [ ] **Step 1: Apply the 20 edits above** (one-liner alternative, then eyeball `git diff`):

```bash
perl -pi -e 's/(reservations, orders, [^"]*?) cascade"/$1, customers cascade"/' \
  src/infrastructure/db/{webhook,tax,tax-reversal,reservas-list,admin,course-sessions,booking-routes,course-billing,availability,notifications,manual-pending,booking-events,pricing-checkout,reschedule}.itest.ts \
  src/infrastructure/payments/mercadopago/mercadopago.itest.ts
```

- [ ] **Step 2: Verify no `reservations, orders` truncate is left without `customers`.** Per file, not per line: the directory itest's cleanup string (Task 1) spans two lines, so a line-level `grep -v customers` would print its first line and mislead you into "fixing" a correct file.

Run: `grep -rl "reservations, orders" --include="*.itest.ts" src | xargs grep -L "customers cascade"`
Expected: no output (every file that truncates `reservations, orders` also contains `customers cascade`). And `git diff --stat` shows exactly 15 files changed.

- [ ] **Step 3: Run the full integration suite** (MP-gated specs self-skip without `MP_ACCESS_TOKEN`):

Run: `npm run test:integration`
Expected: all green. Then `npm run db:reset` (the suite wiped the seed).

- [ ] **Step 4: Commit.**

```bash
git add src/infrastructure/db/*.itest.ts src/infrastructure/payments/mercadopago/mercadopago.itest.ts
git commit -m "test(itest): truncate customers wherever reservations and orders are truncated" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Full verification, push, PR

**Files:** none new.

**Interfaces:**
- Consumes: everything committed in Tasks 0–9 on branch `feat/directorio-clientes-db`.
- Produces: PR `feat(db): directorio de clientes (expand)` on origin; PR2 branches from `main` after squash-merge.

- [ ] **Step 1: Unit + lint + types + build.** `npx eslint .` → 0 · `npm test` → all green · `npm run build` → exit 0 (type-checks the itests too since `tsconfig.json` includes `**/*.ts`).
- [ ] **Step 2: Integration, from a clean seed.** `npm run db:reset && npm run db:types && git diff --exit-code src/infrastructure/db/database.types.ts` (must be empty — CI's "Check generated DB types are in sync" step fails otherwise) → `npm run test:integration` → all green → **`npm run db:reset` again** (never leave the DB seed-less) → from the repo root, `node --input-type=module -e "$(cat /tmp/seed-check.mjs)"` shows the Task 7 balances → restart `npm run dev` (the build rewrote `.next`).
- [ ] **Step 3: Smoke the live code against the new schema (expand/contract check).** With `npm run dev` running: `/admin/reservas` lists the demo bookings; `/admin/reservas/nueva` creates an "Efectivo" booking with a typed name (still the free-text path in PR1: `customer_id` stays null, `select customer_id from reservations order by created_at desc limit 1` → null); public `/reservar` guest checkout still creates a hold. `/cuenta` login as `felipe.munoz@outlook.cl` (magic link in Mailpit, `http://127.0.0.1:54424`) WORKS already: the live upsert-by-id is a no-op update on his row (`id = …00a3`), the panel shows 4.498 pts, and `select id, auth_user_id from customers where email = 'felipe.munoz@outlook.cl'` still returns `…00a3 / …00a3` (nothing was re-created). If it fails, the seed put Felipe on a different `id` than his auth user — fix Task 7, not the live code.
- [ ] **Step 4: Write the PR body** to `/tmp/directorio-pr1-body.md`:

````markdown
## Qué

PR1 de la cadena "Directorio de clientes" — la migración **expand**, tolerada por el código vivo.
Spec: `docs/superpowers/specs/2026-09-09-directorio-clientes-design.md` · Plan:
`docs/superpowers/plans/2026-09-09-directorio-clientes-pr1-expand.md`.

- `supabase/migrations/20260909120000_customer_directory.sql`
  - `customers` con identidad propia: `id` con default, FK a `auth.users` eliminada (resuelta por
    `pg_constraint`), `auth_user_id` nullable/unique con `on delete set null`; guarda que aborta si
    hay emails que difieren solo por mayúsculas/espacios; normalización (lower/trim, nombre ≤ 80,
    teléfono 6–40).
  - `email` opcional; constraints `customers_email_lower`, `customers_contact_required`,
    `customers_name_len`, `customers_phone_len`. **Sin CHECK de forma de email** (un NOT VALID se
    evalúa en UPDATE y `apply_points` actualiza `customers`).
  - `phone_digits` generada (+ índice parcial), `customers_created_idx`.
  - `reservations.customer_id` y `orders.customer_id` (nullable, `on delete set null`, índices parciales).
  - `booking_events` acepta `customer_changed` → categoría `Reservas`.
  - Funciones nuevas, **definidas pero NO ejecutadas**: `upsert_guest_customer`,
    `ensure_customer_for_user`, `backfill_customers_from_bookings`, `update_customer_contact`,
    `assign_booking_customer`, más el helper privado `customer_sync_snapshots` (quien reescribe
    el email de una ficha propaga el snapshot a sus pedidos/reservas: el claw-back por email
    nunca pierde al titular).
- `supabase/seed.sql` (solo local): fichas demo (`…f1, …f2, …f4..f7` + Felipe como titular de
  cuenta con `customers.id = auth_user_id = …00a3`, como toda fila de titular en prod),
  `customer_id` en pedidos/reservas demo, retro para Matías/Catalina/Felipe/Valentina, smoke del backfill.
- Tipos regenerados; `CustomerProfile.email` pasa a `string | null` (ningún consumidor lo lee).
- Itests: `customers-directory.itest.ts` (34 casos: esquema, regex con una barra invertida,
  ensure/adopt/carrera + refresco de email con snapshot propagado, upsert de invitados vs
  titulares, backfill sobre filas sucias, edición con propagación de snapshot y guarda
  `customer_email_in_use`, reasignación con movimiento de earn y claw-back posterior);
  `customer_changed` en `booking-events.itest.ts`; `customers` en los truncates que ya limpian
  reservations/orders.

## Por qué

Hoy `customers.id` ES `auth.users.id` y una ficha solo existe si la persona entró a `/cuenta`;
las reservas guardan solo texto libre. Para elegir/crear cliente al agendar (PR5), tener
`/admin/clientes` (PR6) y "Cambiar cliente" (PR7) hace falta un directorio con identidad propia y
un vínculo `customer_id`. Este PR solo expande el esquema: las funciones de puntos siguen
byte-idénticas (resuelven por `lower(orders.customer_email) = customers.email`) y todo escritor
de `customer_id` reescribe el snapshot desde la ficha, así FK y join coinciden siempre.

## Qué NO hace

- **No ejecuta el backfill** ni crea fichas en el checkout (PR3). Ninguna fila cambia de
  vínculo en prod con este PR; solo se normalizan emails/nombres/teléfonos de `customers`.
- No toca `create_checkout`, `confirm_payment`, `mark_refunded`, `reschedule_*`,
  `award_retro_points`, `apply_points`.
- El código vivo sigue usando el upsert-por-id (`customer-repository.ts:16`); PR2 lo reemplaza
  por `ensure_customer_for_user`.

## Pre-flight en prod (solo lectura, ANTES de aprobar el job `migrate`)

```sql
select lower(trim(email)), count(*) from customers group by 1 having count(*) > 1;            -- DEBE ser vacío (la migración aborta si no)
select count(*) from customers where email <> lower(trim(email));                             -- filas que se normalizan
select count(*) from customers where length(name) > 80 or length(trim(phone)) not between 6 and 40; -- se clampean
select count(distinct lower(customer_email)) from orders
  where lower(customer_email) ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$';                                -- tamaño esperado del directorio (PR3)
select count(*) from orders where customer_email is not null
  and lower(customer_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$';                                -- quedarán sin vincular (PR3)
```

## Verificación local

`npm run db:reset && npm run db:types` (diff: `auth_user_id`, `phone_digits`, `customer_id`, 5 RPC
+ el helper `customer_sync_snapshots`) · `npm test` · `npm run test:integration` · `npx eslint .` ·
`npm run build` — todo exit 0. Smoke del código vivo sobre el esquema nuevo: `/admin/reservas`,
`/admin/reservas/nueva` (efectivo), checkout público y login `/cuenta` como
`felipe.munoz@outlook.cl` (el upsert-por-id vigente actualiza su ficha sin chocar: `id = auth id`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 5: Push and open the PR.**

```bash
git push -u origin feat/directorio-clientes-db
gh pr create --title "feat(db): directorio de clientes (expand)" --body-file /tmp/directorio-pr1-body.md
```

Expected: CI `lint & build` and `integration tests` green; the Vercel preview only proves the build (no DB there). After squash-merge, the owner approves the `migrate` job **only after** running the pre-flight queries on prod. PR2 (`refactor(customers): identidad por auth_user_id`) branches from `main` once this is merged.
