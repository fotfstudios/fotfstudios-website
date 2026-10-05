/**
 * convert_booking_to_trial (migración 20261010120000): un ensayo pagado que era la prueba del
 * curso queda como si se hubiera creado como prueba — pedido 'trial', reserva 'prueba' sin PIN,
 * puntos revocados y crédito por lo pagado que vence 7 días después. Idempotente, y rechaza lo
 * que no es una prueba posible. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const RES = "33333333-3333-4333-8333-333333333333";
const START = "2030-10-10 21:00+00";

const cleanup = "truncate course_credits, points_ledger, reservations, orders, order_lines, tax_documents, booking_events, customers cascade";

async function seed({ end = "2030-10-10 22:00+00", status = "paid" } = {}) {
  const resource = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
  await pg.query(
    "insert into customers (id, name, email, phone, points_balance) values ($1, 'Paula Prueba', 'paula@example.com', '+56911111111', 999)",
    [CUSTOMER],
  );
  await pg.query(
    `insert into orders (id, kind, status, currency, amount_clp, net_clp, tax_clp, customer_id,
                         customer_name, customer_email, payment_method, paid_at)
     values ($1, 'booking', $3, 'CLP', 19990, 16798, 3192, $2, 'Paula Prueba', 'Paula@Example.com', 'transferencia', now())`,
    [ORDER, CUSTOMER, status],
  );
  await pg.query(
    `insert into reservations (id, resource_id, kind, status, starts_at, ends_at, customer_id, order_id, customer_name, access_code)
     values ($1, $2, 'booking', 'confirmed', $5, $6, $3, $4, 'Paula Prueba', '123456')`,
    [RES, resource, CUSTOMER, ORDER, START, end],
  );
  await pg.query("insert into points_ledger (customer_id, order_id, kind, amount, ref) values ($1, $2, 'earn', 999, '')", [
    CUSTOMER,
    ORDER,
  ]);
}

beforeAll(async () => {
  await pg.connect();
});
beforeEach(async () => {
  await pg.query(cleanup);
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});

describe("convert_booking_to_trial", () => {
  it("deja el ensayo como prueba: sin PIN, sin puntos y con su crédito — idempotente", async () => {
    await seed();
    const first = await pg.query<{ id: string }>("select convert_booking_to_trial($1) as id", [RES]);
    const again = await pg.query<{ id: string }>("select convert_booking_to_trial($1) as id", [RES]);
    expect(again.rows[0].id).toBe(first.rows[0].id);

    expect((await pg.query("select kind from orders where id = $1", [ORDER])).rows[0]).toEqual({ kind: "trial" });
    expect((await pg.query("select kind, access_code from reservations where id = $1", [RES])).rows[0]).toEqual({
      kind: "prueba",
      access_code: null,
    });
    expect((await pg.query("select points_balance from customers where id = $1", [CUSTOMER])).rows[0].points_balance).toBe(0);
    const ledger = await pg.query("select kind, amount, ref from points_ledger where order_id = $1 order by kind", [ORDER]);
    expect(ledger.rows).toEqual([
      { kind: "earn", amount: 999, ref: "" },
      { kind: "earn_revoke", amount: -999, ref: "curso:prueba-sin-puntos" },
    ]);

    const credit = await pg.query(
      "select email, amount_clp, source_reservation_id, expires_at = ($1::timestamptz + interval '7 days') as week from course_credits",
      [START],
    );
    expect(credit.rows).toEqual([{ email: "paula@example.com", amount_clp: 19990, source_reservation_id: RES, week: true }]);
  });

  it("rechaza un ensayo que no dura una hora o que no está pagado", async () => {
    await seed({ end: "2030-10-10 23:00+00" });
    await expect(pg.query("select convert_booking_to_trial($1)", [RES])).rejects.toThrow(/prueba_dura_una_hora/);
    await pg.query(cleanup);
    await seed({ status: "pending_payment" });
    await expect(pg.query("select convert_booking_to_trial($1)", [RES])).rejects.toThrow(/prueba_solo_pagada/);
  });
});
