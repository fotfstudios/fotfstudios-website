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

  it("con p_refund_id NULL (siembra-primero) mueve + NC + boleta del saldo, mp_refund_id queda null", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pd3");
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, null, 2000, null,
    ]);
    const o = await pg.query<{ status: string; refunded: number; refund_id: string | null }>(
      "select status, refunded_amount_clp refunded, mp_refund_id refund_id from orders where id=$1", [orderId]);
    expect(o.rows[0]).toMatchObject({ status: "paid", refunded: 2000, refund_id: null });
    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1", [orderId]);
    expect(docs.rows.filter((d) => d.kind === "nota_credito").map((d) => d.total)).toContain(9990);
    expect(docs.rows.filter((d) => d.kind === "boleta").map((d) => d.total)).toContain(7990);
  });
});

// Nuevo horario más caro (cobro diferido): la reserva NO se mueve hasta que el
// delta esté pagado Y el slot siga libre.
const linesUp = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h (punta)", quantity: 1, unit_price_clp: 12990, subtotal_clp: 12990 },
]);
const createCharge = (reservationId: string, start: string, end: string) =>
  pg.query<{ reschedule_id: string; delta_order_id: string }>(
    "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
    [reservationId, start, end, "{}", linesUp, 3000, 2521, 479, null],
  );

describe("reschedule charge (más caro, cobro diferido)", () => {
  it("create_reschedule_charge NO mueve la reserva; apply (slot libre) la mueve y dobla el delta", async () => {
    const { orderId, reservationId, startsAt, endsAt } = await paidBooking(600, "pc1"); // boleta 9990
    const newStart = addHours(endsAt, 1);
    const newEnd = addHours(endsAt, 2);

    const c = await createCharge(reservationId, newStart, newEnd);
    const deltaOrderId = c.rows[0].delta_order_id;

    // Antes de pagar: reserva SIN mover, orden de delta pendiente, reschedule pending_charge.
    let r = await pg.query<{ starts_at: string; status: string }>("select starts_at, status from reservations where id=$1", [reservationId]);
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(startsAt).toISOString());
    const dOrd = await pg.query<{ status: string; amount: number }>("select status, amount_clp amount from orders where id=$1", [deltaOrderId]);
    expect(dOrd.rows[0]).toMatchObject({ status: "pending_payment", amount: 3000 });
    expect((await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [deltaOrderId])).rows[0].status).toBe("pending_charge");

    // Pago del delta → finalizar.
    const applied = await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_delta_1"]);
    expect(applied.rows[0].r).toBe("applied");

    r = await pg.query<{ starts_at: string; status: string }>("select starts_at, status from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed");
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(newStart).toISOString()); // ahora sí movida
    const o = await pg.query<{ status: string; amount: number }>("select status, amount_clp amount from orders where id=$1", [orderId]);
    expect(o.rows[0]).toMatchObject({ status: "paid", amount: 12990 }); // 9990 + 3000
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [deltaOrderId])).rows[0].status).toBe("fulfilled");
    const docs = await pg.query<{ total: number }>("select total from tax_documents where order_id=$1 and kind='boleta'", [orderId]);
    expect(docs.rows.map((d) => d.total)).toContain(3000); // boleta incremental por el delta
    expect((await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [deltaOrderId])).rows[0].status).toBe("applied");
  });

  it("apply con slot tomado → slot_taken: NO mueve, reschedule failed_slot_taken, boleta en la orden de delta", async () => {
    const a = await paidBooking(600, "cs1"); // se quiere mover a las 12:00
    const newStart = addHours(a.endsAt, 1);
    const newEnd = addHours(a.endsAt, 2);
    const c = await createCharge(a.reservationId, newStart, newEnd);
    const deltaOrderId = c.rows[0].delta_order_id;

    // Otro cliente toma el slot destino mientras el cobro estaba pendiente.
    await paidBooking(720, "cs2"); // 12:00–13:00 == [newStart,newEnd]

    const res = await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_delta_2"]);
    expect(res.rows[0].r).toBe("slot_taken");

    const r = await pg.query<{ starts_at: string }>("select starts_at from reservations where id=$1", [a.reservationId]);
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(a.startsAt).toISOString()); // NO se movió
    expect((await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [deltaOrderId])).rows[0].status).toBe("failed_slot_taken");
    expect((await pg.query<{ total: number }>("select total from tax_documents where order_id=$1 and kind='boleta'", [deltaOrderId])).rows[0].total).toBe(3000);
  });

  it("apply repetido → noop (idempotente), sin doblar boleta ni monto", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "ci1");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    const deltaOrderId = c.rows[0].delta_order_id;
    expect((await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_d"])).rows[0].r).toBe("applied");
    expect((await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_d"])).rows[0].r).toBe("noop");
    expect((await pg.query<{ amount: number }>("select amount_clp amount from orders where id=$1", [orderId])).rows[0].amount).toBe(12990); // no doblado
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta' and total=3000", [orderId])).rows[0].n).toBe("1");
  });

  it("expire_abandoned_reschedules cancela cobros pendientes viejos", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "ce1");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    const deltaOrderId = c.rows[0].delta_order_id;
    await pg.query("update reschedules set created_at = now() - interval '73 hours' where delta_order_id=$1", [deltaOrderId]);

    const n = await pg.query<{ n: number }>("select expire_abandoned_reschedules() n");
    expect(Number(n.rows[0].n)).toBeGreaterThanOrEqual(1);
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [deltaOrderId])).rows[0].status).toBe("cancelled");
    expect((await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [deltaOrderId])).rows[0].status).toBe("expired");
  });
});

// Cortesía (sin orden): movimiento puro de calendario — sin plata, sin boleta.
describe("reschedule_courtesy", () => {
  /** Cortesía confirmada directo en la DB (mismo shape que createCourtesyBooking). */
  async function courtesy(startIso: string, endIso: string) {
    const { rows } = await pg.query<{ id: string }>(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, customer_name)
       values ($1, 'booking', 'confirmed', $2, $3, 'Cortesía Test') returning id`,
      [resourceId, startIso, endIso],
    );
    return rows[0].id;
  }

  it("mueve la cortesía a un slot libre y deja el evento en la auditoría (sin orden)", async () => {
    const base = await paidBooking(600, "cc0"); // ancla horaria real del día
    const cStart = addHours(base.endsAt, 1);
    const cEnd = addHours(base.endsAt, 2);
    const id = await courtesy(cStart, cEnd);

    const newStart = addHours(base.endsAt, 3);
    const newEnd = addHours(base.endsAt, 4);
    await pg.query("select reschedule_courtesy($1,$2,$3)", [id, newStart, newEnd]);

    const r = await pg.query<{ status: string; starts_at: string }>("select status, starts_at from reservations where id=$1", [id]);
    expect(r.rows[0].status).toBe("confirmed");
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(newStart).toISOString());
    const a = await pg.query<{ kind: string; status: string; original_order_id: string | null; delta_clp: number }>(
      "select kind, status, original_order_id, delta_clp from reschedules where reservation_id=$1", [id]);
    expect(a.rows[0]).toMatchObject({ kind: "equal", status: "applied", original_order_id: null, delta_clp: 0 });
  });

  it("mover sobre un slot ocupado → aborta (GiST), cortesía intacta", async () => {
    const taken = await paidBooking(600, "cc1");
    const cStart = addHours(taken.endsAt, 1);
    const id = await courtesy(cStart, addHours(taken.endsAt, 2));

    await expect(
      pg.query("select reschedule_courtesy($1,$2,$3)", [id, taken.startsAt, taken.endsAt]),
    ).rejects.toThrow();
    const r = await pg.query<{ starts_at: string }>("select starts_at from reservations where id=$1", [id]);
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(cStart).toISOString());
  });

  it("reserva CON orden → rechazada (esa va por reschedule_move/down)", async () => {
    const b = await paidBooking(600, "cc2");
    await expect(
      pg.query("select reschedule_courtesy($1,$2,$3)", [b.reservationId, addHours(b.endsAt, 1), addHours(b.endsAt, 2)]),
    ).rejects.toThrow(/reschedule_not_active/);
  });
});
