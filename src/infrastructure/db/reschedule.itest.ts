/**
 * Integración del reagendamiento (RPCs reschedule_move / reschedule_down_move /
 * reschedule_settle_refund) contra la DB real. Verifica el invariante central de
 * money-safety: reagendar mueve el horario SIN cancelar la reserva ni marcar la
 * orden 'refunded' (a diferencia de mark_refunded). Gateway stub → no necesita MP.
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
import { SupabaseRescheduleRepository } from "./reschedule-repository";
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
  async cancelPayment(): Promise<{ id: string; status: string }> {
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

const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules, customers cascade";

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

describe("reschedule_down (refund delta, vía move + settle offline — H1)", () => {
  it("reembolsa el delta MANTENIENDO paid+confirmed y moviendo el horario; NC + nueva boleta", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pd1"); // boleta 9990
    const newStart = addHours(endsAt, 1);
    const newEnd = addHours(endsAt, 2);

    // Nuevo slot más barato ($7.990) → delta reembolsado = 2000.
    const { settle } = await downOffline(reservationId, newStart, newEnd, linesDown, 2000);
    expect(settle).toBe("applied");

    const r = await pg.query<{ status: string; starts_at: string }>("select status, starts_at from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed"); // el invariante clave: NO cancelada
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(new Date(newStart).toISOString());

    const o = await pg.query<{ status: string; amount: number; refunded: number }>(
      "select status, amount_clp amount, refunded_amount_clp refunded from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("paid"); // sigue paid, NO 'refunded'
    expect(o.rows[0].amount).toBe(9990); // total original intacto
    expect(o.rows[0].refunded).toBe(2000); // delta acumulado → boleta viva = 7990

    // NC y boleta reemitida nacen en la misma tx (mismo created_at): el desempate por kind/total
    // hace el orden determinista.
    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1 order by created_at, kind, total", [orderId]);
    expect(docs.rows.map((d) => d.kind)).toContain("nota_credito");
    expect(docs.rows.find((d) => d.kind === "nota_credito")?.total).toBe(9990); // NC por la boleta vieja
    expect(docs.rows.filter((d) => d.kind === "boleta").map((d) => d.total)).toContain(7990); // nueva boleta por el saldo
  });

  it("delta fuera de rango (> boleta viva) → aborta en el MOVE, antes de tocar plata", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pd2");
    await expect(
      pg.query("select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 99999]),
    ).rejects.toThrow();
  });

  // El viejo caso "p_refund_id NULL (siembra-primero)" ya no aplica: reschedule_down_move
  // no recibe refund id (recién existe al ASENTAR, vía reschedule_settle_refund) — el
  // invariante que importaba (mover sin tocar plata) está cubierto por "move: ... SIN
  // tocar plata, líneas ni boletas" en la describe de pending_refund más abajo.
});

// Nuevo horario más caro (cobro diferido): la reserva NO se mueve hasta que el
// delta esté pagado Y el slot siga libre.
const linesUp = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h (punta)", quantity: 1, unit_price_clp: 12990, subtotal_clp: 12990 },
]);
const createCharge = (reservationId: string, start: string, end: string) =>
  pg
    .query<{ reschedule_id: string; delta_order_id: string }>(
      "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
      [reservationId, start, end, "{}", linesUp, 3000, 2521, 479, null],
    )
    .then((r) => r.rows[0]);

/** Simula el vencimiento del hold del cupo (24 h): expires_at al pasado + barrido expire_stale_holds. */
const expireHold = async (rescheduleId: string) => {
  await pg.query("update reservations set expires_at = now() - interval '1 minute' where reschedule_id=$1", [rescheduleId]);
  await pg.query("select expire_stale_holds()");
};

/** Baja de precio completa (mover + asentar offline) — reemplaza al viejo reschedule_down en los tests. */
async function downOffline(reservationId: string, start: string, end: string, lines: string, amount: number) {
  const m = await pg.query<{ reschedule_down_move: string }>(
    "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)", [reservationId, start, end, "{}", lines, amount, null]);
  const id = m.rows[0].reschedule_down_move;
  const s = await pg.query<{ reschedule_settle_refund: string }>(
    "select reschedule_settle_refund($1,$2,$3)", [id, "offline:reschedule", amount]);
  return { rescheduleId: id, settle: s.rows[0].reschedule_settle_refund };
}

describe("reschedule charge (más caro, cobro diferido)", () => {
  it("create_reschedule_charge NO mueve la reserva; apply (slot libre) la mueve y dobla el delta", async () => {
    const { orderId, reservationId, startsAt, endsAt } = await paidBooking(600, "pc1"); // boleta 9990
    const newStart = addHours(endsAt, 1);
    const newEnd = addHours(endsAt, 2);

    const c = await createCharge(reservationId, newStart, newEnd);
    const deltaOrderId = c.delta_order_id;

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
    const deltaOrderId = c.delta_order_id;

    // El hold del cupo venció (24 h sin pagar) y otro cliente tomó el slot destino.
    await expireHold(c.reschedule_id);
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
    const deltaOrderId = c.delta_order_id;
    expect((await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_d"])).rows[0].r).toBe("applied");
    expect((await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [deltaOrderId, "mp_d"])).rows[0].r).toBe("noop");
    expect((await pg.query<{ amount: number }>("select amount_clp amount from orders where id=$1", [orderId])).rows[0].amount).toBe(12990); // no doblado
    // Aditivo idempotente: una sola boleta delta de 3000 (no duplicada).
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta' and total=3000", [orderId])).rows[0].n).toBe("1");
  });

  it("tras el encarecimiento aditivo, mark_refunded total anula CADA boleta viva (NC por boleta)", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "cinv");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select apply_reschedule_charge($1,$2)", [c.delta_order_id, "mp_inv"]);
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
    const deltaOrderId = c.delta_order_id;
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
    const deltaOrderId = c.delta_order_id;
    await pg.query("select apply_reschedule_charge($1,$2)", [deltaOrderId, "mp_cmp"]);

    // Abaratar 12990 → 8000 (refund 4990). El refund cabe en la boleta original (9990).
    const lines8000 = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 8000, subtotal_clp: 8000 }]);
    const { settle } = await downOffline(reservationId, addHours(endsAt, 3), addHours(endsAt, 4), lines8000, 4990);
    expect(settle).toBe("applied");

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

// A1 reordenó "más barato" a seat-first: reschedule_down (hoy downOffline: move + settle)
// se llama con un refund id que aún no es el definitivo de MP al momento del asiento.
// El claw-back de earn quedaba keyed a un ref CONSTANTE ('manual') → un segundo
// reagendamiento más barato de la MISMA orden colisiona con el unique (order_id, kind, ref)
// del primero y su revocación incremental se descarta en silencio (el cliente conserva
// puntos que ya no le corresponden). Repro: dos downOffline consecutivos sobre la misma
// orden (cada uno crea su propia fila de reschedules, así que el ref queda único por fila).
describe("reschedule_down_move + settle — claw-back de earn no colisiona entre reagendamientos sucesivos", () => {
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

  it("dos downOffline consecutivos (más barato) revocan CADA incremento de earn, sin colisión de ref", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    // El id ya no es la clave natural de una ficha: el conflicto que importa es
    // el email (customers_email_key), que `on conflict (id)` dejaría escapar como 23505.
    await pg.query("insert into customers (id, email, auth_user_id) values ($1,$2,$1) on conflict (email) do nothing", [EARN_CUST_ID, EARN_EMAIL]);

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
    await downOffline(reservationId, addHours(endsAt, 1), addHours(endsAt, 2), lines7990, 2000);
    expect(await earnSum(orderId)).toBe(399); // floor(0.05·7990); primer claw-back de -100 aplicado

    // Reagenda #2, misma orden, otra vez seat-first: 7990 → 5990, delta 2000.
    await downOffline(reservationId, addHours(endsAt, 3), addHours(endsAt, 4), lines5990, 2000);

    // Con la regresión, el segundo claw-back (-100) colisiona en (order_id,'earn_revoke','manual')
    // con el primero y se descarta: earnSum queda en 399 en vez de converger a 299.
    expect(await earnSum(orderId)).toBe(299); // floor(0.05·5990)
    const revokes = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1 and kind='earn_revoke'", [orderId]);
    expect(Number(revokes.rows[0].n)).toBe(2); // dos claw-backs distintos, ninguno colisionado
  });

  it("encarecer hace TRUING de earn (floor del total, no floor-por-tramo): 9990→19980 ⇒ 999 (no 998)", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    // El id ya no es la clave natural de una ficha: el conflicto que importa es
    // el email (customers_email_key), que `on conflict (id)` dejaría escapar como 23505.
    await pg.query("insert into customers (id, email, auth_user_id) values ($1,$2,$1) on conflict (email) do nothing", [EARN_CUST_ID, EARN_EMAIL]);

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

  /**
   * El retro NO puede volver a premiar el pedido delta.
   *
   * `award_retro_points` recorre todo pedido del email en estado
   * `paid|fulfilled|refunded` y otorga 5% si no ve una fila `(pedido,'earn','')`.
   * Un pedido delta de reagendamiento queda `fulfilled` con el mismo email, pero
   * su earn se asentó en el pedido ORIGINAL con ref `reschedule:{id}` — el delta
   * no tiene ninguna fila propia. Sin la exclusión, el barrido lo lee como "pagado
   * y nunca premiado" y acuña un 5% extra.
   *
   * Importa porque `ensureCustomer` lo llama en CADA visita autenticada
   * (`customer-service.ts`), así que sobre-acreditaría en cada login, para siempre:
   * ningún claw-back lo revierte (todos apuntan al pedido principal).
   */
  it("el retro NO vuelve a premiar el pedido delta de un reagendamiento", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    await pg.query("insert into customers (id, email, auth_user_id) values ($1,$2,$1) on conflict (email) do nothing", [EARN_CUST_ID, EARN_EMAIL]);

    const b = await checkout.createBooking({ resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: EARN_EMAIL } });
    if (!b.ok) throw new Error(`book failed: ${b.error}`);
    const orderId = b.value.orderId;
    expect(await pay(orderId, "pretro_delta", 9990)).toBe("paid");
    const r0 = await pg.query<{ id: string; ends_at: string }>("select id, ends_at from reservations where order_id=$1", [orderId]);

    // Encarecer 9990 → 19980. El earn del encarecimiento va al pedido ORIGINAL.
    const linesUp = JSON.stringify([{ line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 19980, subtotal_clp: 19980 }]);
    const c = await pg.query<{ delta_order_id: string }>(
      "select * from create_reschedule_charge($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)",
      [r0.rows[0].id, addHours(r0.rows[0].ends_at, 1), addHours(r0.rows[0].ends_at, 2), "{}", linesUp, 9990, 8395, 1595, null],
    );
    const deltaOrderId = c.rows[0].delta_order_id;
    await pg.query("select apply_reschedule_charge($1,$2)", [deltaOrderId, "mp_retro_delta"]);

    // Premisas del bug, para que el caso falle por la razón correcta y no por otra.
    const delta = await pg.query<{ status: string; amount_clp: number; email: string }>(
      "select status::text, amount_clp, lower(customer_email) email from orders where id=$1",
      [deltaOrderId],
    );
    expect(delta.rows[0].status).toBe("fulfilled"); // entra al filtro de estado del retro
    expect(delta.rows[0].email).toBe(EARN_EMAIL); //  y resuelve al mismo cliente
    const deltaLedger = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1", [deltaOrderId]);
    expect(deltaLedger.rows[0].n).toBe("0"); // su earn vive en el pedido original

    const balanceAntes = await pg.query<{ points_balance: number }>("select points_balance from customers where id=$1", [EARN_CUST_ID]);
    const earnedAntes = await earnSum(orderId);

    // Con la función vieja esto devuelve 499 (= floor(0.05·9990) del delta).
    const retro = await pg.query<{ n: number }>("select award_retro_points($1) n", [EARN_CUST_ID]);
    expect(retro.rows[0].n).toBe(0);

    // Y nada se movió: ni el saldo, ni el ledger del original, ni el del delta.
    const balanceDespues = await pg.query<{ points_balance: number }>("select points_balance from customers where id=$1", [EARN_CUST_ID]);
    expect(balanceDespues.rows[0].points_balance).toBe(balanceAntes.rows[0].points_balance);
    expect(await earnSum(orderId)).toBe(earnedAntes);
    const deltaLedgerDespues = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1", [deltaOrderId]);
    expect(deltaLedgerDespues.rows[0].n).toBe("0");
  });

  /** El retro legítimo sigue funcionando: un pedido pagado SIN earn previo sí se premia. */
  it("el retro sigue premiando un pedido normal que nunca ganó", async () => {
    await insertAuthUser(EARN_CUST_ID, EARN_EMAIL);
    await pg.query("insert into customers (id, email, auth_user_id) values ($1,$2,$1) on conflict (email) do nothing", [EARN_CUST_ID, EARN_EMAIL]);
    // Pedido pagado a mano, sin pasar por confirm_payment → sin earn.
    const o = await pg.query<{ id: string }>(
      `insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_email)
         values ('paid', 'CLP', 20000, 16807, 3193, $1) returning id`,
      [EARN_EMAIL],
    );
    expect((await pg.query<{ n: number }>("select award_retro_points($1) n", [EARN_CUST_ID])).rows[0].n).toBe(1000);
    const rows = await pg.query<{ n: string }>("select count(*)::text n from points_ledger where order_id=$1 and kind='earn'", [o.rows[0].id]);
    expect(rows.rows[0].n).toBe("1");
  });
});

describe("pending charge lifecycle (auditoría 2026-09-14, H2/H3)", () => {
  it("cancel_booking cancela el cobro pendiente y su orden delta, y registra reschedule_cancelled + cancelled", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc1");
    const { delta_order_id } = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_booking($1)", [reservationId]);
    const rs = await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [delta_order_id]);
    expect(rs.rows[0].status).toBe("cancelled");
    const d = await pg.query<{ status: string }>("select status from orders where id=$1", [delta_order_id]);
    expect(d.rows[0].status).toBe("cancelled");
    const ev = await pg.query<{ type: string }>("select type from booking_events where reservation_id=$1 order by occurred_at, seq", [reservationId]);
    expect(ev.rows.map((r) => r.type)).toEqual(expect.arrayContaining(["reschedule_cancelled", "cancelled"]));
  });

  it("pago tardío de un cobro cancelado → charge_void: delta paid + boleta en la delta, original intacta", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pc2");
    const { delta_order_id } = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_booking($1)", [reservationId]);
    const r = await pg.query<{ apply_reschedule_charge: string }>("select apply_reschedule_charge($1,$2)", [delta_order_id, "late-pay"]);
    expect(r.rows[0].apply_reschedule_charge).toBe("charge_void");
    const d = await pg.query<{ status: string; n: number }>(
      "select o.status, (select count(*)::int from tax_documents t where t.order_id=o.id and t.kind='boleta') n from orders o where o.id=$1", [delta_order_id]);
    expect(d.rows[0]).toEqual({ status: "paid", n: 1 });
    const o = await pg.query<{ amount: number }>("select amount_clp amount from orders where id=$1", [orderId]);
    expect(o.rows[0].amount).toBe(9990); // NO se sumó el delta
  });

  it("charge_void repetido → noop, sin segunda boleta ni eventos duplicados", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc2b");
    const { delta_order_id } = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_booking($1)", [reservationId]);
    const first = await pg.query<{ apply_reschedule_charge: string }>("select apply_reschedule_charge($1,$2)", [delta_order_id, "late-pay"]);
    expect(first.rows[0].apply_reschedule_charge).toBe("charge_void");
    const second = await pg.query<{ apply_reschedule_charge: string }>("select apply_reschedule_charge($1,$2)", [delta_order_id, "late-pay-retry"]);
    expect(second.rows[0].apply_reschedule_charge).toBe("noop");
    const boletas = await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'", [delta_order_id]);
    expect(boletas.rows[0].n).toBe("1");
    const paidEvents = await pg.query<{ n: string }>(
      "select count(*)::text n from booking_events where reservation_id=$1 and type='reschedule_charge_paid'", [reservationId]);
    expect(paidEvents.rows[0].n).toBe("1");
  });

  it("reserva cancelada por fuera (update crudo) → reservation_gone, misma contabilidad que slot_taken", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc3");
    const { delta_order_id } = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("update reservations set status='cancelled' where id=$1", [reservationId]);
    const r = await pg.query<{ apply_reschedule_charge: string }>("select apply_reschedule_charge($1,$2)", [delta_order_id, "late-pay"]);
    expect(r.rows[0].apply_reschedule_charge).toBe("reservation_gone");
    const rs = await pg.query<{ status: string }>("select status from reschedules where delta_order_id=$1", [delta_order_id]);
    expect(rs.rows[0].status).toBe("failed_slot_taken");
  });

  it("segundo cobro pendiente en la misma reserva → reschedule_pending_exists (y el índice único lo respalda)", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc4");
    await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await expect(createCharge(reservationId, addHours(endsAt, 3), addHours(endsAt, 4))).rejects.toThrow(/reschedule_pending_exists/);
    await expect(
      pg.query("select reschedule_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 3), addHours(endsAt, 4), "{}", lines1h, null]),
    ).rejects.toThrow(/reschedule_pending_exists/);
  });

  it("cancel_reschedule_charge: pendiente → true + delta cancelled; repetido → false", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc5");
    const { reschedule_id, delta_order_id } = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    const a = await pg.query<{ cancel_reschedule_charge: boolean }>("select cancel_reschedule_charge($1)", [reschedule_id]);
    expect(a.rows[0].cancel_reschedule_charge).toBe(true);
    const d = await pg.query<{ status: string }>("select status from orders where id=$1", [delta_order_id]);
    expect(d.rows[0].status).toBe("cancelled");
    const b = await pg.query<{ cancel_reschedule_charge: boolean }>("select cancel_reschedule_charge($1)", [reschedule_id]);
    expect(b.rows[0].cancel_reschedule_charge).toBe(false);
  });

  it("chargeForOrder (repo) encuentra la orden delta de un cobro failed_slot_taken — su reembolso NO debe asentar otra fila pending_refund", async () => {
    const a = await paidBooking(600, "pc7");
    const c = await createCharge(a.reservationId, addHours(a.endsAt, 1), addHours(a.endsAt, 2));
    await expireHold(c.reschedule_id);
    await paidBooking(720, "pc7b"); // toma el slot destino (el hold ya venció)
    expect((await pg.query<{ r: string }>("select apply_reschedule_charge($1,$2) r", [c.delta_order_id, "mp_pc7"])).rows[0].r).toBe("slot_taken");
    const repo = new SupabaseRescheduleRepository(db);
    expect(await repo.chargeForOrder(c.delta_order_id)).toEqual({ deltaOrderId: c.delta_order_id, rescheduleId: c.reschedule_id });
    // Un cobro APLICADO ya no es "cobro" para el webhook: su delta es parte del pedido vivo.
    const b = await paidBooking(840, "pc7c");
    const c2 = await createCharge(b.reservationId, addHours(b.endsAt, 1), addHours(b.endsAt, 2));
    await pg.query("select apply_reschedule_charge($1,$2)", [c2.delta_order_id, "mp_pc7c"]);
    expect(await repo.chargeForOrder(c2.delta_order_id)).toBeNull();
  });

  it("mark_refunded sobre la orden DELTA (slot_taken) NO cancela un cobro pendiente nuevo de la reserva viva", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pc6");
    const first = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_reschedule_charge($1)", [first.reschedule_id]);
    await pg.query("select apply_reschedule_charge($1,$2)", [first.delta_order_id, "late-pay"]); // charge_void → delta paid + boleta
    const second = await createCharge(reservationId, addHours(endsAt, 3), addHours(endsAt, 4));
    await pg.query("select mark_refunded($1,$2)", [first.delta_order_id, "ref-void"]);
    const rs = await pg.query<{ status: string }>("select status from reschedules where id=$1", [second.reschedule_id]);
    expect(rs.rows[0].status).toBe("pending_charge");
    const ev = await pg.query<{ type: string }>("select type from booking_events where reservation_id=$1 and type='cancelled'", [reservationId]);
    expect(ev.rows).toHaveLength(0);
  });
});

describe("eventos que faltaban (auditoría 2026-09-14, H5)", () => {
  it("cancel_booking sin reembolso registra 'cancelled'", async () => {
    const { reservationId } = await paidBooking(600, "ev1");
    await pg.query("select cancel_booking($1)", [reservationId]);
    const ev = await pg.query<{ type: string }>("select type from booking_events where reservation_id=$1 and type='cancelled'", [reservationId]);
    expect(ev.rows).toHaveLength(1);
  });
});

describe("reschedule_down_move + reschedule_settle_refund (auditoría 2026-09-14, H1)", () => {
  it("move: mueve el rango y deja pending_refund SIN tocar plata, líneas ni boletas", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pr1");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    const rs = await pg.query<{ status: string; delta_clp: number; settled_clp: number }>("select status, delta_clp, settled_clp from reschedules where id=$1", [m.rows[0].reschedule_down_move]);
    expect(rs.rows[0]).toEqual({ status: "pending_refund", delta_clp: 2000, settled_clp: 0 });
    const r = await pg.query<{ starts_at: string }>("select starts_at from reservations where id=$1", [reservationId]);
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(addHours(endsAt, 1));
    const o = await pg.query<{ refunded: number; n_lines: number; n_docs: number }>(
      "select refunded_amount_clp refunded, (select count(*)::int from order_lines where order_id=o.id) n_lines, (select count(*)::int from tax_documents where order_id=o.id) n_docs from orders o where id=$1", [orderId]);
    expect(o.rows[0]).toEqual({ refunded: 0, n_lines: 1, n_docs: 1 });
    const l = await pg.query<{ subtotal_clp: number }>("select subtotal_clp from order_lines where order_id=$1", [orderId]);
    expect(l.rows[0].subtotal_clp).toBe(9990); // líneas viejas hasta asentar
  });

  it("settle: asienta refunded/NC/boleta/puntos, reescribe líneas y aplica; mismo refund id tras applied → duplicate; otro id → noop", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pr2");
    const { rescheduleId, settle } = await downOffline(reservationId, addHours(endsAt, 1), addHours(endsAt, 2), linesDown, 2000);
    expect(settle).toBe("applied");
    const o = await pg.query<{ status: string; refunded: number }>("select status, refunded_amount_clp refunded from orders where id=$1", [orderId]);
    expect(o.rows[0]).toEqual({ status: "paid", refunded: 2000 });
    // NC y boleta reemitida comparten created_at (misma tx) → se compara como multiset ordenado
    // por (kind, total), no por orden de creación.
    const docs = await pg.query<{ kind: string; total: number }>("select kind, total from tax_documents where order_id=$1", [orderId]);
    const byKindTotal = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]) || a[1] - b[1];
    expect(docs.rows.map((d): [string, number] => [d.kind, d.total]).sort(byKindTotal)).toEqual([["boleta", 7990], ["boleta", 9990], ["nota_credito", 9990]]);
    const l = await pg.query<{ subtotal_clp: number }>("select subtotal_clp from order_lines where order_id=$1", [orderId]);
    expect(l.rows[0].subtotal_clp).toBe(7990);
    const again = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [rescheduleId, "offline:reschedule", 2000]);
    // El loopback que asienta el ÚLTIMO split deja la fila applied; el asiento del admin con el
    // mismo id es un duplicado (no un noop, que significaría "reserva cancelada entre medio").
    expect(again.rows[0].reschedule_settle_refund).toBe("duplicate");
    const other = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [rescheduleId, "ref-otro", 2000]);
    expect(other.rows[0].reschedule_settle_refund).toBe("noop"); // ya applied y refund id nuevo
  });

  it("settle parcial (multi-pago): dos asientos por refund id distinto → settled, luego applied; I1′ se cumple en el medio", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pr3");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2)); // +3000 → boletas 9990 + 3000
    await pg.query("select apply_reschedule_charge($1,$2)", [c.delta_order_id, "pay-delta"]);
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 3), addHours(endsAt, 4), "{}", linesDown, 11000]);
    const id = m.rows[0].reschedule_down_move;
    const s1 = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "ref-A", 9990]);
    expect(s1.rows[0].reschedule_settle_refund).toBe("settled");
    const mid = await pg.query<{ live: number; amount: number; refunded: number }>(
      "select coalesce(sum(total-reversed_clp),0)::int live, (select amount_clp from orders where id=$1) amount, (select refunded_amount_clp from orders where id=$1) refunded from tax_documents where order_id=$1 and kind='boleta'", [orderId]);
    expect(mid.rows[0].live).toBe(mid.rows[0].amount - mid.rows[0].refunded);
    const dup = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "ref-A", 9990]);
    expect(dup.rows[0].reschedule_settle_refund).toBe("duplicate");
    const s2 = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "ref-B", 1010]);
    expect(s2.rows[0].reschedule_settle_refund).toBe("applied");
  });

  it("settle capea al saldo vivo y nunca cancela la reserva", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr4");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    await pg.query("select reschedule_settle_refund($1,$2,$3)", [m.rows[0].reschedule_down_move, "ref-X", 999999]);
    const r = await pg.query<{ status: string }>("select status from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed");
  });

  it("con pending_refund: reschedule_move/create_reschedule_charge/segundo move → reschedule_pending_exists; expire_abandoned_reschedules lo ignora", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr5");
    await pg.query("select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    await expect(pg.query("select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 5), addHours(endsAt, 6), "{}", linesDown, 1000])).rejects.toThrow(/reschedule_pending_exists/);
    await pg.query("update reschedules set created_at = now() - interval '80 hours' where reservation_id=$1", [reservationId]);
    await pg.query("select expire_abandoned_reschedules()");
    const rs = await pg.query<{ status: string }>("select status from reschedules where reservation_id=$1", [reservationId]);
    expect(rs.rows[0].status).toBe("pending_refund");
  });

  it("cancel_booking con pending_refund (vía webhook) → fila cancelled con payment_ref = id en vuelo; settle posterior → cancelled (no noop)", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr6");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    const id = m.rows[0].reschedule_down_move;
    await pg.query("update reschedules set mp_refund_id='ref-flight', mp_refund_payment_id='pr6' where id=$1", [id]);
    await pg.query("select cancel_booking($1)", [reservationId]);
    const ev = await pg.query<{ payment_ref: string }>("select payment_ref from booking_events where reschedule_id=$1 and type='reschedule_cancelled'", [id]);
    expect(ev.rows[0].payment_ref).toBe("ref-flight");
    const s = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "ref-flight", 2000]);
    // `cancelled` (no `noop`): el servicio solo asienta sobre la orden cancelada (mark_refunded)
    // con esta respuesta; un `noop` genérico nunca autoriza cancelar nada.
    expect(s.rows[0].reschedule_settle_refund).toBe("cancelled");
    const o = await pg.query<{ refunded: number }>("select refunded_amount_clp refunded from orders where id=(select original_order_id from reschedules where id=$1)", [id]);
    expect(o.rows[0].refunded).toBe(0); // la RPC no toca plata en ese caso
  });

  it("settle offline:* suma a offline_settled_clp; un refund id de MP no", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr9");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2)); // +3000 → boletas 9990 + 3000
    await pg.query("select apply_reschedule_charge($1,$2)", [c.delta_order_id, "pay-delta-9"]);
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 3), addHours(endsAt, 4), "{}", linesDown, 11000]);
    const id = m.rows[0].reschedule_down_move;
    const s1 = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "offline:reschedule", 9990]);
    expect(s1.rows[0].reschedule_settle_refund).toBe("settled");
    let rs = await pg.query<{ settled_clp: number; offline_settled_clp: number }>("select settled_clp, offline_settled_clp from reschedules where id=$1", [id]);
    expect(rs.rows[0]).toEqual({ settled_clp: 9990, offline_settled_clp: 9990 });
    const s2 = await pg.query<{ reschedule_settle_refund: string }>("select reschedule_settle_refund($1,$2,$3)", [id, "ref-mp-9", 1010]);
    expect(s2.rows[0].reschedule_settle_refund).toBe("applied");
    rs = await pg.query<{ settled_clp: number; offline_settled_clp: number }>("select settled_clp, offline_settled_clp from reschedules where id=$1", [id]);
    expect(rs.rows[0]).toEqual({ settled_clp: 11000, offline_settled_clp: 9990 }); // el split MP no suma a offline
  });

  it("lease del reembolso (refund_attempt_at): el primer claim toma la fila, el segundo dentro de 5 min no; release la libera", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr10");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    const id = m.rows[0].reschedule_down_move;
    // Mismo predicado que SupabaseRescheduleRepository.claimRefundAttempt (allí el corte de 5 min
    // se pasa como ISO desde JS): solo una fila pendiente sin lease, o con lease vencido.
    const claim = () =>
      pg.query<{ id: string }>(
        `update reschedules set refund_attempt_at = now()
          where id = $1 and status = 'pending_refund'
            and (refund_attempt_at is null or refund_attempt_at < now() - interval '5 minutes')
          returning id`,
        [id],
      );
    expect((await claim()).rows).toHaveLength(1);
    expect((await claim()).rows).toHaveLength(0); // otro emisor dentro de la ventana: no toma la fila
    // Lease vencido → vuelve a poder tomarse.
    await pg.query("update reschedules set refund_attempt_at = now() - interval '6 minutes' where id=$1", [id]);
    expect((await claim()).rows).toHaveLength(1);

    // El repo real, contra PostgREST: claim → false mientras dure el lease; release → claim de nuevo.
    const repo = new SupabaseRescheduleRepository(db);
    expect(await repo.claimRefundAttempt(id)).toBe(false); // el claim crudo de arriba sigue vigente
    await repo.releaseRefundAttempt(id);
    expect(await repo.claimRefundAttempt(id)).toBe(true);
    expect(await repo.claimRefundAttempt(id)).toBe(false);
    // Una fila que ya no está pendiente no se toma nunca.
    await pg.query("select reschedule_settle_refund($1,$2,$3)", [id, "offline:reschedule", 2000]);
    await repo.releaseRefundAttempt(id);
    expect(await repo.claimRefundAttempt(id)).toBe(false);
  });

  it("settle con p_refund_id null → rechaza (un id nulo rompería la idempotencia por-refund y el ref not null de puntos)", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "pr7");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    await expect(
      pg.query("select reschedule_settle_refund($1,$2,$3)", [m.rows[0].reschedule_down_move, null, 2000]),
    ).rejects.toThrow(/reschedule_bad_refund_id/);
  });

  it("cancel_booking con pending_refund → el evento reschedule_cancelled cuelga de la orden ORIGINAL (no tiene delta_order_id)", async () => {
    const { orderId, reservationId, endsAt } = await paidBooking(600, "pr8");
    const m = await pg.query<{ reschedule_down_move: string }>(
      "select reschedule_down_move($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [reservationId, addHours(endsAt, 1), addHours(endsAt, 2), "{}", linesDown, 2000]);
    const id = m.rows[0].reschedule_down_move;
    await pg.query("select cancel_booking($1)", [reservationId]);
    const ev = await pg.query<{ order_id: string }>(
      "select order_id from booking_events where reschedule_id=$1 and type='reschedule_cancelled'", [id]);
    expect(ev.rows[0].order_id).toBe(orderId);
  });
});

describe("cobro pendiente: el cupo destino queda RESERVADO mientras el cliente paga (hold)", () => {
  const holdOf = (rescheduleId: string) =>
    pg
      .query<{ id: string; status: string; kind: string; order_id: string | null; expires_in_h: number; customer_email: string }>(
        "select id, status, kind, order_id, round(extract(epoch from (expires_at - now()))/3600)::int expires_in_h, customer_email from reservations where reschedule_id=$1",
        [rescheduleId],
      )
      .then((r) => r.rows);

  it("create_reschedule_charge crea un hold sin orden (24 h) en el cupo nuevo y el GiST lo protege de otro checkout", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "hold1");
    const newStart = addHours(endsAt, 1);
    const newEnd = addHours(endsAt, 2);
    const c = await createCharge(reservationId, newStart, newEnd);
    const holds = await holdOf(c.reschedule_id);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ status: "held", kind: "booking", order_id: null, expires_in_h: 24, customer_email: "r@e.cl" });
    // Otro cliente intenta el MISMO cupo: la exclusion constraint lo rechaza.
    const other = await checkout.createBooking({ resourceId, date: MON, startMinute: 720, durationHours: 1, customer: { email: "otro@e.cl" } });
    expect(other.ok).toBe(false);
    // El cupo ORIGINAL sigue ocupado por la reserva (nada se movió todavía).
    const r = await pg.query<{ starts_at: string }>("select starts_at from reservations where id=$1", [reservationId]);
    expect(new Date(r.rows[0].starts_at).toISOString()).not.toBe(newStart);
  });

  it("si el cupo nuevo ya está tomado, create_reschedule_charge falla por GiST y no deja orden delta ni fila", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "hold2");
    await paidBooking(660, "hold2b"); // ocupa 11:00–12:00
    await expect(createCharge(reservationId, addHours(endsAt, 0), addHours(endsAt, 1))).rejects.toThrow(/exclusion|23P01|overlap/i);
    const rows = await pg.query<{ n: string }>("select count(*)::text n from reschedules where reservation_id=$1", [reservationId]);
    expect(rows.rows[0].n).toBe("0");
  });

  it("apply_reschedule_charge borra el hold y mueve la reserva al cupo (sin chocar consigo mismo)", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "hold3");
    const newStart = addHours(endsAt, 1);
    const c = await createCharge(reservationId, newStart, addHours(endsAt, 2));
    const res = await pg.query<{ apply_reschedule_charge: string }>("select apply_reschedule_charge($1,$2)", [c.delta_order_id, "pay-hold3"]);
    expect(res.rows[0].apply_reschedule_charge).toBe("applied");
    expect(await holdOf(c.reschedule_id)).toHaveLength(0);
    const r = await pg.query<{ starts_at: string; status: string }>("select starts_at, status from reservations where id=$1", [reservationId]);
    expect(r.rows[0].status).toBe("confirmed");
    expect(new Date(r.rows[0].starts_at).toISOString()).toBe(newStart);
  });

  it("anular el cobro y el barrido de 72 h borran el hold", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "hold4");
    const a = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_reschedule_charge($1)", [a.reschedule_id]);
    expect(await holdOf(a.reschedule_id)).toHaveLength(0);
    const b = await createCharge(reservationId, addHours(endsAt, 3), addHours(endsAt, 4));
    await pg.query("update reschedules set created_at = now() - interval '80 hours' where id=$1", [b.reschedule_id]);
    await pg.query("select expire_abandoned_reschedules()");
    expect(await holdOf(b.reschedule_id)).toHaveLength(0);
  });

  it("cancelar la reserva original con cobro pendiente también borra el hold", async () => {
    const { reservationId, endsAt } = await paidBooking(600, "hold5");
    const c = await createCharge(reservationId, addHours(endsAt, 1), addHours(endsAt, 2));
    await pg.query("select cancel_booking($1)", [reservationId]);
    expect(await holdOf(c.reschedule_id)).toHaveLength(0);
  });
});
