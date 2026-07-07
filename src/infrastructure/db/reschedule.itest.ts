/**
 * Integración del reagendamiento (RPCs reschedule_move / reschedule_down) contra
 * la DB real. Verifica el invariante central de money-safety: reagendar mueve el
 * horario SIN cancelar la reserva ni marcar la orden 'refunded' (a diferencia de
 * mark_refunded). Gateway stub → no necesita MP. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import type { PaymentGateway, PaymentInfo, PreferenceResult, RefundResult } from "@/src/application/ports/payment";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";
import { SupabaseWebhookRepository } from "./webhook-repository";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
const webhookRepo = new SupabaseWebhookRepository(db);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

class StubGateway implements PaymentGateway {
  constructor(private readonly info: PaymentInfo) {}
  async createPreference(): Promise<PreferenceResult> {
    throw new Error("unused");
  }
  async getPayment(): Promise<PaymentInfo> {
    return this.info;
  }
  async findPaymentByOrder(): Promise<PaymentInfo | null> {
    return this.info;
  }
  async refundPayment(): Promise<RefundResult> {
    throw new Error("unused");
  }
}

const MON = futureDate(1); // día futuro (valle a las 10:00 → $9.990/h)
const book = (start: number) =>
  checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email: "r@e.cl" } });

const pay = async (orderId: string, paymentId: string, amount: number) => {
  const svc = new WebhookService(new StubGateway({ id: paymentId, status: "approved", externalReference: orderId, amount }), webhookRepo);
  return (await svc.handlePaymentNotification(paymentId)).result;
};

/** Reserva pagada + confirmada; devuelve ids y el rango UTC real reservado. */
async function paidBooking(start: number, paymentId: string) {
  const b = await book(start);
  if (!b.ok) throw new Error(`book failed: ${b.error}`);
  expect(await pay(b.value.orderId, paymentId, 9990)).toBe("paid");
  const r = await pg.query<{ id: string; starts_at: string; ends_at: string }>(
    "select id, starts_at, ends_at from reservations where order_id=$1", [b.value.orderId]);
  return { orderId: b.value.orderId, reservationId: r.rows[0].id, startsAt: r.rows[0].starts_at, endsAt: r.rows[0].ends_at };
}

/** Suma horas a un instante ISO, robusto ante zona horaria/DST. */
const addHours = (iso: string, n: number) => new Date(Date.parse(iso) + n * 3_600_000).toISOString();
const lines1h = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h (valle)", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 },
]);
const linesDown = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h (valle)", quantity: 1, unit_price_clp: 7990, subtotal_clp: 7990 },
]);

const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules cascade";

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("reschedule_move (equal)", () => {
  it("mueve el rango a un slot libre; líneas reescritas; amount_clp intacto; reserva sigue confirmada", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pm1"); // 10:00–11:00
    const newStart = addHours(endsAt, 1); // 12:00 (libre)
    const newEnd = addHours(endsAt, 2);

    await pg.query("select reschedule_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [
      reservationId, newStart, newEnd, "{}", lines1h, "Reagendada",
    ]);

    const r = await pg.query<{ status: string; starts_at: string }>("select status, starts_at from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed"); // NO cancelada
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(newStart).toISOString());
    const o = await pg.query<{ status: string; amount: number; refunded: number }>(
      "select status, amount_clp amount, refunded_amount_clp refunded from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].amount).toBe(9990);
    expect(o.rows[0].refunded).toBe(0);
    const sum = await pg.query<{ s: string }>("select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1", [orderId]);
    expect(Number(sum.rows[0].s)).toBe(9990);
    const rr = await pg.query<{ status: string; kind: string }>("select status, kind from reschedules where reservation_id=$1", [reservationId]);
    expect(rr.rows[0]).toMatchObject({ status: "applied", kind: "equal" });
  });

  it("mover sobre un slot ocupado → aborta (GiST), reserva intacta", async () => {
    const a = await paidBooking(600, "pa1"); // 10:00
    const b = await paidBooking(720, "pb1"); // 12:00 (ocupa el destino)

    await expect(
      pg.query("select reschedule_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [a.reservationId, b.startsAt, b.endsAt, "{}", lines1h, null]),
    ).rejects.toThrow();

    const r = await pg.query<{ starts_at: string }>("select starts_at from reservations where id=$1", [a.reservationId]);
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(a.startsAt).toISOString()); // no se movió
  });
});

describe("reschedule_down (refund delta)", () => {
  it("reembolsa el delta MANTENIENDO paid+confirmed y moviendo el horario; NC + nueva boleta", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pd1"); // boleta 9990
    const newStart = addHours(endsAt, 1);
    const newEnd = addHours(endsAt, 2);

    // Nuevo slot más barato ($7.990) → delta reembolsado = 2000.
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, newStart, newEnd, "{}", linesDown, "mp_ref_1", 2000, "Reagendada + reembolso",
    ]);

    const r = await pg.query<{ status: string; starts_at: string }>("select status, starts_at from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed"); // el invariante clave: NO cancelada
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(newStart).toISOString());

    const o = await pg.query<{ status: string; amount: number; refunded: number }>(
      "select status, amount_clp amount, refunded_amount_clp refunded from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("paid"); // sigue paid, NO 'refunded'
    expect(o.rows[0].amount).toBe(9990); // total original intacto
    expect(o.rows[0].refunded).toBe(2000); // delta acumulado → boleta viva = 7990

    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1 order by created_at", [orderId]);
    expect(docs.rows.map((d) => d.kind)).toContain("nota_credito");
    expect(docs.rows.find((d) => d.kind === "nota_credito")?.total).toBe(9990); // NC por la boleta vieja
    expect(docs.rows.filter((d) => d.kind === "boleta").map((d) => d.total)).toContain(7990); // nueva boleta por el saldo
  });

  it("delta fuera de rango (> boleta viva) → aborta", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pd2");
    await expect(
      pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, "mp_x", 99999, null]),
    ).rejects.toThrow();
  });
});
