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
  async listRefunds() {
    return this.info.refunds ?? [];
  }
  async getRefund() {
    return this.info.refunds?.[0] ?? null;
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

/** Cliente con usuario auth real (customers.id → auth.users.id), como en points.itest.ts. */
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
    const docs = await pg.query<{ kind: string; total: number; live: boolean }>(
      "select kind, total, is_live live from tax_documents where order_id=$1 order by created_at", [orderId]);
    // Aditivo: la boleta original (9990) sigue VIVA + una boleta delta (3000) nueva. Sin NC.
    expect(docs.rows.filter((d) => d.kind === "boleta" && d.live).map((d) => d.total).sort((a, b) => a - b)).toEqual([3000, 9990]);
    expect(docs.rows.filter((d) => d.kind === "nota_credito")).toEqual([]);
    // I1': boletas vivas suman amount − refunded (12990).
    const live = await pg.query<{ s: string }>(
      "select coalesce(sum(total - reversed_clp),0)::text s from tax_documents where order_id=$1 and kind='boleta'", [orderId]);
    expect(Number(live.rows[0].s)).toBe(12990);
    // La boleta delta la financia el pago de la orden de delta (per-payment refund).
    const dBol = await pg.query<{ settlement: string }>(
      "select settlement_order_id settlement from tax_documents where order_id=$1 and kind='boleta' and total=3000", [orderId]);
    expect(dBol.rows[0].settlement).toBe(deltaOrderId);
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
    // Aditivo idempotente: una sola boleta delta de 3000 (no duplicada).
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta' and total=3000", [orderId])).rows[0].n).toBe("1");
  });

  it("tras el encarecimiento aditivo, mark_refunded total anula CADA boleta viva (NC por boleta)", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "cinv");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select apply_reschedule_charge($1,$2)", [c.rows[0].delta_order_id, "mp_inv"]);
    // Boletas vivas [9990, 3000]; el reembolso total emite UNA NC por CADA una (regla SII:
    // la NC referencia el folio de una boleta, no un monto agregado).
    await pg.query("select mark_refunded($1,$2,$3)", [orderId, "mp_ref_inv", 12990]);
    const ncs = await pg.query<{ total: number; reverses: string }>(
      "select total, reverses_document_id reverses from tax_documents where order_id=$1 and kind='nota_credito' order by total", [orderId]);
    expect(ncs.rows.map((d) => d.total)).toEqual([3000, 9990]);
    expect(ncs.rows.every((d) => d.reverses !== null)).toBe(true); // cada NC enlazada a su boleta
    // Sin boletas vivas tras el reembolso total (I1': 0 = 12990 − 12990).
    const live = await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta' and is_live", [orderId]);
    expect(live.rows[0].n).toBe("0");
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

describe("create_boleta_amount — guard $0", () => {
  it("con total 0 no emite documento (return null, sin fila de $0)", async () => {
    const { orderId } = await paidBooking(600, "z0");
    // (El guard $0 de create_nota_credito_amount 3-arg está cubierto en tax-reversal.itest.ts.)
    const bo = await pg.query<{ id: string | null }>("select create_boleta_amount($1, 0) id", [orderId]);
    expect(bo.rows[0].id).toBeNull();
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and total=0", [orderId])).rows[0].n).toBe("0");
  });
});

// Escenario compuesto: pagar → encarecer (aditivo) → abaratar. Verifica I1' y que el
// abaratamiento anula boletas vivas más-antigua-primero conservando el financiamiento
// por-pago de las boletas no tocadas.
describe("compuesto encarecer→abaratar (multi-boleta)", () => {
  it("9990 → +3000 (aditivo) → −4990: I1' se mantiene; NC más-antigua-primero; boleta delta intacta", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "cmp1");
    // Encarecer a 12990 (delta 3000) y pagarlo.
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    const deltaOrderId = c.rows[0].delta_order_id;
    await pg.query("select apply_reschedule_charge($1,$2)", [deltaOrderId, "mp_cmp"]);

    // Abaratar 12990 → 8000 (refund 4990). El refund cabe en la boleta original (9990).
    const lines8000 = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 8000, subtotal_clp: 8000 }]);
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, addHours(endsAt, 3), addHours(endsAt, 4), "{}", lines8000, "mp_cmp_ref", 4990, null,
    ]);

    const o = await pg.query<{ amount: number; refunded: number }>(
      "select amount_clp amount, refunded_amount_clp refunded from orders where id=$1", [orderId]);
    expect(o.rows[0]).toMatchObject({ amount: 12990, refunded: 4990 });

    // I1': boletas vivas suman amount − refunded = 8000.
    const live = await pg.query<{ id: string; total: number; reversed: number; settlement: string }>(
      "select id, total, reversed_clp reversed, settlement_order_id settlement from tax_documents where order_id=$1 and kind='boleta' and is_live order by total", [orderId]);
    expect(live.rows.reduce((s, r) => s + (r.total - r.reversed), 0)).toBe(8000);
    // La boleta original (9990) se anuló y se reemitió su saldo (5000), financiado por el pago original;
    // la boleta delta (3000, financiada por la orden de delta) quedó intacta.
    expect(live.rows.map((r) => r.total - r.reversed).sort((a, b) => a - b)).toEqual([3000, 5000]);
    const deltaLive = live.rows.find((r) => r.total === 3000);
    expect(deltaLive?.settlement).toBe(deltaOrderId);
  });
});

// A1 reordenó "más barato" a seat-first: reschedule_down se llama con p_refund_id
// NULL (el refund id de MP aún no existe al momento del asiento). El claw-back de
// earn quedaba keyed a un ref CONSTANTE ('manual') → un segundo reagendamiento más
// barato de la MISMA orden colisiona con el unique (order_id, kind, ref) del primero
// y su revocación incremental se descarta en silencio (el cliente conserva puntos
// que ya no le corresponden). Repro: dos reschedule_down consecutivos, cada uno con
// p_refund_id NULL (el camino real).
describe("reschedule_down — claw-back de earn no colisiona entre reagendamientos sucesivos", () => {
  const EARN_CUST_ID = "e0000000-0000-4000-a000-000000000099";
  const EARN_EMAIL = "resched-earn@e.cl";

  const earnSum = async (orderId: string) =>
    Number(
      (
        await pg.query<{ s: string }>(
          "select coalesce(sum(amount),0)::text s from points_ledger where order_id=$1 and kind in ('earn','earn_revoke')",
          [orderId],
        )
      ).rows[0].s,
    );

  it("dos reschedule_down consecutivos (más barato), ambos con p_refund_id NULL, revocan CADA incremento de earn", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    await pg.query("insert into customers (id, email) values ($1,$2) on conflict (id) do nothing", [EARN_CUST_ID, EARN_EMAIL]);

    // Cliente con perfil ANTES de pagar → confirm_payment otorga el earn real (5%).
    const b = await checkout.createBooking({ resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: EARN_EMAIL } });
    if (!b.ok) throw new Error(`book failed: ${b.error}`);
    const orderId = b.value.orderId;
    expect(await pay(orderId, "pearn1", 9990)).toBe("paid");
    const r0 = await pg.query<{ id: string; ends_at: string }>("select id, ends_at from reservations where order_id=$1", [orderId]);
    const reservationId = r0.rows[0].id;
    const endsAt = r0.rows[0].ends_at;

    expect(await earnSum(orderId)).toBe(499); // floor(0.05·9990)

    const lines7990 = JSON.stringify([
      { line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 7990, subtotal_clp: 7990 },
    ]);
    const lines5990 = JSON.stringify([
      { line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 5990, subtotal_clp: 5990 },
    ]);

    // Reagenda #1 (seat-first, como RescheduleService): 9990 → 7990, delta 2000.
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", lines7990, null, 2000, null,
    ]);
    expect(await earnSum(orderId)).toBe(399); // floor(0.05·7990); primer claw-back de -100 aplicado

    // Reagenda #2, misma orden, otra vez seat-first: 7990 → 5990, delta 2000.
    await pg.query("select reschedule_down($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [
      reservationId, addHours(endsAt, 3), addHours(endsAt, 4), "{}", lines5990, null, 2000, null,
    ]);

    // Con la regresión, el segundo claw-back (-100) colisiona en (order_id,'earn_revoke','manual')
    // con el primero y se descarta: earnSum queda en 399 en vez de converger a 299.
    expect(await earnSum(orderId)).toBe(299); // floor(0.05·5990)
    const revokes = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1 and kind='earn_revoke'", [orderId]);
    expect(Number(revokes.rows[0].n)).toBe(2); // dos claw-backs distintos, ninguno colisionado
  });

  it("encarecer hace TRUING de earn (floor del total, no floor-por-tramo): 9990→19980 ⇒ 999 (no 998)", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    await pg.query("insert into customers (id, email) values ($1,$2) on conflict (id) do nothing", [EARN_CUST_ID, EARN_EMAIL]);

    const b = await checkout.createBooking({ resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: EARN_EMAIL } });
    if (!b.ok) throw new Error(`book failed: ${b.error}`);
    const orderId = b.value.orderId;
    expect(await pay(orderId, "pearn_up", 9990)).toBe("paid");
    const r0 = await pg.query<{ id: string; ends_at: string }>("select id, ends_at from reservations where order_id=$1", [orderId]);
    expect(await earnSum(orderId)).toBe(499);

    // Encarecer +9990 → total 19980. floor(0.05·19980)=999; floor-por-tramo daría 499+499=998.
    const linesUp2 = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 19980, subtotal_clp: 19980 }]);
    const c = await pg.query<{ delta_order_id: string }>(
      "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
      [r0.rows[0].id, addHours(r0.rows[0].ends_at, 1), addHours(r0.rows[0].ends_at, 2), "{}", linesUp2, 9990, 8395, 1595, null],
    );
    await pg.query("select apply_reschedule_charge($1,$2)", [c.rows[0].delta_order_id, "mp_up"]);

    expect(await earnSum(orderId)).toBe(999); // truing: no pierde el punto del redondeo
    const earns = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1 and kind='earn'", [orderId]);
    expect(earns.rows[0].n).toBe("2"); // earn inicial + earn del encarecimiento (una sola fila)
  });
});
