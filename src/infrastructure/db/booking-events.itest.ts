/**
 * Log de eventos de reserva (booking_events): fuente única y ordenada del timeline
 * del admin. Cada RPC que cambia estado inserta su(s) evento(s) DENTRO de su
 * transacción (atómico con el cambio) → el log nunca diverge del estado real.
 * Requiere Supabase local.
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

const MON = futureDate(1);
const pay = async (orderId: string, paymentId: string, amount: number) => {
  const svc = new WebhookService(new StubGateway({ id: paymentId, status: "approved", externalReference: orderId, amount }), webhookRepo);
  return (await svc.handlePaymentNotification(paymentId)).result;
};

async function paidBooking(start: number, paymentId: string) {
  const b = await checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email: "be@e.cl" } });
  if (!b.ok) throw new Error(`book failed: ${b.error}`);
  expect(await pay(b.value.orderId, paymentId, 9990)).toBe("paid");
  const r = await pg.query<{ id: string; ends_at: string }>("select id, ends_at from reservations where order_id=$1", [b.value.orderId]);
  return { orderId: b.value.orderId, reservationId: r.rows[0].id, endsAt: r.rows[0].ends_at };
}

const addHours = (iso: string, n: number) => new Date(Date.parse(iso) + n * 3_600_000).toISOString();
const lines1h = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 }]);
const linesUp = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 12990, subtotal_clp: 12990 }]);
const linesDown = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 7990, subtotal_clp: 7990 }]);

const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules, booking_events cascade";

/** Eventos de una reserva, en el orden del timeline (más reciente primero). */
async function events(reservationId: string) {
  const { rows } = await pg.query<{ type: string; category: string; amount_clp: number | null }>(
    "select type, category, amount_clp from booking_events where reservation_id=$1 order by occurred_at desc, seq desc",
    [reservationId],
  );
  return rows;
}
const types = (rows: { type: string }[]) => rows.map((r) => r.type);

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

describe("booking_events — checkout + pago", () => {
  it("crear + pagar deja: created, payment_confirmed, boleta_issued con sus categorías", async () => {
    const { reservationId } = await paidBooking(600, "bep1");
    const e = await events(reservationId);
    expect(types(e)).toEqual(expect.arrayContaining(["created", "payment_confirmed", "boleta_issued"]));
    const byType = Object.fromEntries(e.map((r) => [r.type, r]));
    expect(byType.created.category).toBe("Reservas");
    expect(byType.payment_confirmed).toMatchObject({ category: "Pagos", amount_clp: 9990 });
    expect(byType.boleta_issued).toMatchObject({ category: "Documentos tributarios", amount_clp: 9990 });
  });
});

describe("booking_events — reagendamientos", () => {
  it("reschedule_move → reschedule_moved (Reservas)", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "bem1");
    await pg.query("select reschedule_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", lines1h, null]);
    const e = await events(reservationId);
    const moved = e.find((r) => r.type === "reschedule_moved");
    expect(moved?.category).toBe("Reservas");
  });

  it("reschedule_down → reschedule_refund + nota_credito_issued + boleta_issued + reschedule_moved", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "bed1");
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, "mp_r", 2000, null]);
    const e = await events(reservationId);
    expect(types(e)).toEqual(expect.arrayContaining(["reschedule_refund", "nota_credito_issued", "boleta_issued", "reschedule_moved"]));
    expect(e.find((r) => r.type === "reschedule_refund")).toMatchObject({ category: "Pagos", amount_clp: 2000 });
    expect(e.find((r) => r.type === "nota_credito_issued")?.category).toBe("Documentos tributarios");
  });

  it("charge diferido → reschedule_charge_pending, luego reschedule_charge_paid + boleta_issued + reschedule_moved", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "bec1");
    const c = await pg.query<{ delta_order_id: string }>(
      "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
      [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesUp, 3000, 2521, 479, null],
    );
    let e = await events(reservationId);
    expect(types(e)).toContain("reschedule_charge_pending");
    expect(e.find((r) => r.type === "reschedule_charge_pending")).toMatchObject({ category: "Pagos", amount_clp: 3000 });

    await pg.query("select apply_reschedule_charge($1,$2)", [c.rows[0].delta_order_id, "mp_dch"]);
    e = await events(reservationId);
    expect(types(e)).toEqual(expect.arrayContaining(["reschedule_charge_paid", "boleta_issued", "reschedule_moved"]));
  });
});

describe("booking_events — reembolso/cancelación", () => {
  it("mark_refunded → refunded + cancelled + nota_credito_issued", async () => {
    const { orderId, reservationId } = await paidBooking(600, "ber1");
    await pg.query("select mark_refunded($1,$2,$3)", [orderId, "mp_rf", 9990]);
    const e = await events(reservationId);
    expect(types(e)).toEqual(expect.arrayContaining(["refunded", "cancelled", "nota_credito_issued"]));
    expect(e.find((r) => r.type === "refunded")).toMatchObject({ category: "Pagos", amount_clp: 9990 });
    expect(e.find((r) => r.type === "cancelled")?.category).toBe("Reservas");
  });
});

describe("booking_events — orden del timeline", () => {
  it("los eventos vienen más-reciente-primero; created es el más antiguo", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "beo1");
    await pg.query("select reschedule_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", lines1h, null]);
    const e = await events(reservationId);
    // 'created' es el evento más antiguo → último en el orden desc.
    expect(e[e.length - 1].type).toBe("created");
    // 'reschedule_moved' ocurrió después del pago.
    const idxMoved = e.findIndex((r) => r.type === "reschedule_moved");
    const idxPaid = e.findIndex((r) => r.type === "payment_confirmed");
    expect(idxMoved).toBeLessThan(idxPaid); // más reciente aparece antes
  });
});
