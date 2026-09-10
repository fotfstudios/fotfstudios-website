/**
 * Adaptador Supabase del directorio (SupabaseCustomerRepository): lo que agrega
 * el ADAPTADOR sobre las RPC/tablas de PR1 — mapeo de columnas, el OR de
 * `bookingsForCustomer`, `EnsureCustomerResult` como valor y la traducción de
 * rechazos a sentinelas. La semántica SQL (adopción, idempotencia, cada
 * `raise exception`) ya la prueba `customers-directory.itest.ts` de PR1: no se
 * repite acá. Fixtures por `pg` (como el seed); el adaptador, por supabase-js.
 * Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SupabaseCustomerRepository } from "./customer-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseCustomerRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

// Usuarios auth propios de este archivo (ids distintos a points/reschedule/directory).
const U1 = "e0000000-0000-4000-a000-000000000201";
const U2 = "e0000000-0000-4000-a000-000000000202"; // lo usa Task 4 (findByAuthUser sin ficha)

const cleanup =
  "truncate reservations, orders, order_lines, payment_intents, booking_events, points_ledger, customers cascade";

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

/** Ficha insertada directo (fixture), sin pasar por las RPC. Devuelve el id. */
async function customer(c: {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  authUserId?: string | null;
}): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `insert into customers (id, name, email, phone, auth_user_id)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) returning id`,
    [c.id ?? null, c.name ?? null, c.email ?? null, c.phone ?? null, c.authUserId ?? null],
  );
  return r.rows[0].id;
}

let slot = 0;
/** Reserva 'booking' + pedido pending_payment directo; cada llamada usa otro horario (GiST). */
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

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await insertAuthUser(U1, "u1@repo.cl");
  await insertAuthUser(U2, "u2@repo.cl");
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("getProfile: identidad propia", () => {
  it("mapea authUserId y createdAt; una ficha del directorio no tiene cuenta", async () => {
    const linked = await customer({ id: U1, email: "linked@repo.cl", name: "Titular", authUserId: U1 });
    const guest = await customer({ name: "Pía", phone: "+56912345678" });

    const a = await repo.getProfile(linked);
    expect(a).toMatchObject({ id: U1, authUserId: U1, email: "linked@repo.cl", name: "Titular", pointsBalance: 0 });
    expect(typeof a?.createdAt).toBe("string");

    const b = await repo.getProfile(guest);
    expect(b).toMatchObject({ authUserId: null, email: null, phone: "+56912345678" });
    expect(b?.id).not.toBe(U1); // ficha del directorio: id propio

    expect(await repo.getProfile("e0000000-0000-4000-a000-0000000002ff")).toBeNull();
  });
});
