/**
 * Integración: promo de primera reserva — el predicado SQL `first_booking_promo_used`
 * y, más abajo, el checkout público real aplicando la línea de descuento.
 * Requiere Supabase local + envs (ver test:integration).
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

beforeAll(async () => {
  await pg.connect();
  const r = await pg.query<{ id: string }>("select id from resources limit 1");
  resourceId = r.rows[0].id;
});

afterAll(async () => {
  await pg.query("truncate reservations, orders, order_lines, customers cascade");
  await pg.end();
});

beforeEach(async () => {
  await pg.query("truncate reservations, orders, order_lines, customers cascade");
});

async function used(email: string): Promise<boolean> {
  const r = await pg.query<{ used: boolean }>("select first_booking_promo_used($1) as used", [email]);
  return r.rows[0].used;
}

async function insertOrder(o: { email: string | null; status: string; kind?: string }): Promise<void> {
  await pg.query(
    `insert into orders (status, amount_clp, net_clp, tax_clp, customer_email, kind)
     values ($1::order_status, 10000, 8403, 1597, $2, $3)`,
    [o.status, o.email, o.kind ?? "booking"],
  );
}

describe("first_booking_promo_used(email)", () => {
  it("sin pedidos → no usada", async () => {
    expect(await used("nueva@example.com")).toBe(false);
  });

  it.each(["pending_payment", "cancelled"])("un pedido %s no consume la promo", async (status) => {
    await insertOrder({ email: "a@example.com", status });
    expect(await used("a@example.com")).toBe(false);
  });

  it.each(["paid", "fulfilled", "refunded"])("un pedido %s la consume", async (status) => {
    await insertOrder({ email: "a@example.com", status });
    expect(await used("a@example.com")).toBe(true);
  });

  it("compara sin distinguir mayúsculas ni espacios (filas históricas con mayúsculas)", async () => {
    await insertOrder({ email: "Mixed@Case.CL", status: "paid" });
    expect(await used("mixed@case.cl")).toBe(true);
    expect(await used("  MIXED@case.cl ")).toBe(true);
  });

  it("un pedido del curso no cuenta como reserva de sala", async () => {
    await insertOrder({ email: "a@example.com", status: "paid", kind: "course" });
    expect(await used("a@example.com")).toBe(false);
  });

  it("una cortesía (reserva confirmada sin pedido) no la consume", async () => {
    await pg.query(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_email, notes)
       values ($1, 'booking', 'confirmed', now() + interval '30 days', now() + interval '30 days 1 hour',
               'a@example.com', 'Cortesía')`,
      [resourceId],
    );
    expect(await used("a@example.com")).toBe(false);
  });

  it("un pedido sin email nunca consume nada", async () => {
    await insertOrder({ email: null, status: "paid" });
    expect(await used("")).toBe(false);
  });
});
