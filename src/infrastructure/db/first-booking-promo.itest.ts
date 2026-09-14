/**
 * Integración: promo de primera reserva — el predicado SQL `first_booking_promo_used`
 * y, más abajo, el checkout público real aplicando la línea de descuento.
 * Requiere Supabase local + envs (ver test:integration).
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { FirstBookingPromoService } from "@/src/application/checkout/first-booking-promo";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabasePromoRepository } from "./promo-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { SupabaseRescheduleRepository } from "./reschedule-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const promo = new FirstBookingPromoService(new SupabasePromoRepository(db));
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
  promo,
);
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

/**
 * Checkout público real. Misma reserva que el itest del descuento manual (Vie 19:00,
 * 2h punta finde + audio+video → $75.970 sin promo): la promo es exactamente ese
 * descuento con parámetros fijos, así que los números tienen que coincidir.
 */
describe("checkout público — promo de primera reserva", () => {
  const VIE = futureDate(5);
  const VIE_2 = futureDate(5, 3); // mismo horario/franja, otro viernes
  const base = {
    date: VIE,
    startMinute: 1140, // 19:00
    durationHours: 2,
    addonKeys: ["audioVideo"],
    customer: { name: "Test", email: "primera@e.cl" },
  };
  const PUBLIC = { firstBookingPromo: true };

  async function linesOf(orderId: string) {
    const r = await pg.query<{ line_type: string; description: string; subtotal_clp: number }>(
      "select line_type, description, subtotal_clp from order_lines where order_id=$1 order by subtotal_clp desc",
      [orderId],
    );
    return r.rows;
  }

  it("correo nuevo: línea −$8.000 '20% sala · primera reserva', $67.970 a cobrar, líneas cuadran", async () => {
    const r = await checkout.createBooking({ resourceId, ...base }, PUBLIC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.amount).toBe(67970);

    const lines = await linesOf(r.value.orderId);
    expect(lines).toContainEqual({
      line_type: "discount",
      description: "Descuento 20% sala · primera reserva",
      subtotal_clp: -8000,
    });
    expect(lines.reduce((s, l) => s + l.subtotal_clp, 0)).toBe(67970);

    const o = await pg.query<{ amount_clp: number; net_clp: number; tax_clp: number; total: number }>(
      "select amount_clp, net_clp, tax_clp, (pricing_snapshot->>'total')::int as total from orders where id=$1",
      [r.value.orderId],
    );
    expect(o.rows[0].amount_clp).toBe(67970);
    expect(o.rows[0].net_clp + o.rows[0].tax_clp).toBe(67970);
    expect(o.rows[0].total).toBe(75970); // snapshot = quote del motor, sin promo
  });

  it("tras pagar: boleta por $67.970, puntos sobre el efectivo, y la segunda reserva ya no lleva promo", async () => {
    const first = await checkout.createBooking({ resourceId, ...base }, PUBLIC);
    if (!first.ok) throw new Error(first.error);
    await pg.query("select confirm_payment($1,$2)", [first.value.orderId, "pay-promo"]);

    const bol = await pg.query<{ neto: number; iva: number; total: number }>(
      "select neto, iva, total from tax_documents where order_id=$1 and kind='boleta'",
      [first.value.orderId],
    );
    expect(bol.rows).toHaveLength(1);
    expect(bol.rows[0].total).toBe(67970);
    expect(bol.rows[0].neto + bol.rows[0].iva).toBe(67970);

    const earn = await pg.query<{ amount: number }>(
      "select amount from points_ledger where order_id=$1 and kind='earn'",
      [first.value.orderId],
    );
    expect(earn.rows[0]?.amount).toBe(Math.floor(0.05 * 67970));

    // Mismo correo, con mayúsculas y otro horario: ya no es primera reserva.
    const second = await checkout.createBooking(
      { resourceId, ...base, date: VIE_2, customer: { name: "Test", email: "PRIMERA@e.cl" } },
      PUBLIC,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.amount).toBe(75970);
    const lines = await linesOf(second.value.orderId);
    expect(lines.some((l) => l.description.includes("primera reserva"))).toBe(false);
  });

  it("sin opts (camino del admin) no aplica la promo aunque el correo sea nuevo", async () => {
    const r = await checkout.createBooking({ resourceId, ...base });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(75970);
  });

  it("el reagendamiento rescata la promo como concesión de $8.000 (se arrastra en pesos)", async () => {
    const r = await checkout.createBooking({ resourceId, ...base }, PUBLIC);
    if (!r.ok) throw new Error(r.error);
    await pg.query("select confirm_payment($1,$2)", [r.value.orderId, "pay-promo-resch"]);
    const res = await pg.query<{ id: string }>("select id from reservations where order_id=$1", [r.value.orderId]);
    const ctx = await new SupabaseRescheduleRepository(db).loadContext(res.rows[0].id);
    expect(ctx?.concessionClp).toBe(8000);
  });

  it("carrera aceptada: con la primera aún pendiente de pago, la segunda también recibe la promo", async () => {
    const a = await checkout.createBooking({ resourceId, ...base }, PUBLIC);
    const b = await checkout.createBooking({ resourceId, ...base, date: VIE_2 }, PUBLIC);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.amount).toBe(67970);
      expect(b.value.amount).toBe(67970);
    }
  });
});
