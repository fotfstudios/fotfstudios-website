/**
 * Integración del webhook: confirma/cancela un pedido a partir del estado del
 * pago (gateway stub → no necesita MP). Verifica idempotencia y liberación de
 * horario. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RefundService } from "@/src/application/admin/refund-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseAdminRepository } from "./admin-repository";
import type {
  PaymentGateway,
  PaymentInfo,
  PreferenceResult,
  RefundResult,
} from "@/src/application/ports/payment";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";
import { SupabaseWebhookRepository } from "./webhook-repository";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const repo = new SupabaseWebhookRepository(db);
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
}

const MON = futureDate(1); // lunes futuro
const book = (start: number, email: string) =>
  checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email } });

const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events cascade";

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

describe("webhook", () => {
  it("approved → pedido pagado + reserva confirmada, e idempotente", async () => {
    const b = await book(600, "a@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    const svc = new WebhookService(
      new StubGateway({
        id: "pay1",
        status: "approved",
        externalReference: orderId,
        amount: 9990,
        paymentTypeId: "credit_card",
        paymentMethodId: "master",
        cardLast4: "2580",
        installments: 1,
        feeAmount: 590,
        netReceivedAmount: 9400,
      }),
      repo,
    );
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("paid");

    const o = await pg.query<{ status: string; snap: Record<string, unknown> }>(
      "select status, payment_snapshot as snap from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("paid");
    // El snapshot del pago se guardó para observabilidad en el admin.
    expect(o.rows[0].snap?.payment_method_id).toBe("master");
    expect(o.rows[0].snap?.net_received_amount).toBe(9400);
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [orderId]);
    expect(r.rows[0].status).toBe("confirmed");

    // misma notificación otra vez → no reprocesa
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
  });

  it("approved sin hold vigente → paid_unreserved, no confirma reserva ni emite boleta", async () => {
    const b = await book(600, "d@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    // Simula que el hold venció y fue barrido/revendido antes de que llegue el pago.
    await pg.query("update reservations set status='expired' where order_id=$1", [orderId]);

    const svc = new WebhookService(
      new StubGateway({ id: "pay3", status: "approved", externalReference: orderId, amount: 9990 }),
      repo,
    );
    expect((await svc.handlePaymentNotification("pay3")).result).toBe("paid_unreserved");

    // La orden queda pagada (el dinero llegó) pero marcada notificada para suprimir el
    // email de confirmación; la reserva NO se confirma y no se crea boleta.
    const o = await pg.query<{ status: string; notified_at: string | null }>(
      "select status, notified_at from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("paid");
    expect(o.rows[0].notified_at).not.toBeNull();
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [orderId]);
    expect(r.rows[0].status).toBe("expired");
    const t = await pg.query("select 1 from tax_documents where order_id=$1", [orderId]);
    expect(t.rowCount).toBe(0);
  });

  it("rejected → NO cancela: hold intacto y un reintento aprobado confirma la MISMA orden", async () => {
    const b = await book(600, "b@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    // Intento rechazado (Checkout Pro ofrece reintentar dentro del mismo checkout).
    const rejected = new WebhookService(
      new StubGateway({ id: "pay2", status: "rejected", externalReference: orderId }),
      repo,
    );
    expect((await rejected.handlePaymentNotification("pay2")).result).toBe("rejected");

    // La orden sigue pendiente y el hold sigue tomando el horario.
    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("pending_payment");
    const b2 = await book(600, "c@e.cl");
    expect(b2.ok).toBe(false); // slot_taken: el hold NO se liberó

    // Reintento aprobado dentro de la ventana → confirma la MISMA orden (sin paid_no_hold).
    const amount = (await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [orderId]))
      .rows[0].amount_clp;
    const approved = new WebhookService(
      new StubGateway({ id: "pay2b", status: "approved", externalReference: orderId, amount }),
      repo,
    );
    expect((await approved.handlePaymentNotification("pay2b")).result).toBe("paid");
    const o2 = await pg.query<{ status: string }>("select status from orders where id=$1", [orderId]);
    expect(o2.rows[0].status).toBe("paid");
  });

  it("refunded (reembolso externo) → orden reembolsada, NC y libera el horario", async () => {
    const b = await book(600, "e@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    // 1) pagar
    const paid = new WebhookService(
      new StubGateway({ id: "pay5", status: "approved", externalReference: orderId, amount: 9990 }),
      repo,
    );
    expect((await paid.handlePaymentNotification("pay5")).result).toBe("paid");

    // 2) reembolso hecho fuera del panel → MP notifica status refunded
    const refunded = new WebhookService(
      new StubGateway({
        id: "pay5",
        status: "refunded",
        externalReference: orderId,
        amount: 9990,
        refunds: [{ id: "refund_9", amount: 9990, status: "approved" }],
      }),
      repo,
    );
    expect((await refunded.handlePaymentNotification("pay5")).result).toBe("refunded");

    const o = await pg.query<{ status: string; mp_refund_id: string | null }>(
      "select status, mp_refund_id from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("refunded");
    expect(o.rows[0].mp_refund_id).toBe("refund_9"); // id del reembolso registrado desde el webhook
    const nc = await pg.query("select 1 from tax_documents where order_id=$1 and kind='nota_credito'", [orderId]);
    expect(nc.rowCount).toBe(1);

    // el horario quedó libre → se puede reservar de nuevo
    expect((await book(600, "f@e.cl")).ok).toBe(true);
  });

  it("refunded parcial → cancela, NC por el total y nueva boleta por el saldo (SII)", async () => {
    const b = await book(600, "g@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    // pagar
    await new WebhookService(
      new StubGateway({ id: "pay6", status: "approved", externalReference: orderId, amount: 9990 }),
      repo,
    ).handlePaymentNotification("pay6");

    // reembolso PARCIAL: el pago sigue 'approved', solo aparece en refunds[]
    const partial = new WebhookService(
      new StubGateway({
        id: "pay6",
        status: "approved",
        externalReference: orderId,
        amount: 9990,
        refunds: [{ id: "refund_p", amount: 4000, status: "approved" }],
      }),
      repo,
    );
    expect((await partial.handlePaymentNotification("pay6")).result).toBe("refunded");

    const o = await pg.query<{ status: string; refunded_amount_clp: number }>(
      "select status, refunded_amount_clp from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("refunded");
    expect(o.rows[0].refunded_amount_clp).toBe(4000);
    // cualquier reembolso cancela la reserva
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [orderId]);
    expect(r.rows[0].status).toBe("cancelled");
    // SII: NC por el total (9990) + boleta original + nueva boleta por el saldo (5990)
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1);
    const bol = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'",
      [orderId],
    );
    expect(Number(bol.rows[0].n)).toBe(2);
    const saldo = await pg.query<{ total: number }>(
      "select total from tax_documents where order_id=$1 and kind='boleta' order by created_at desc limit 1",
      [orderId],
    );
    expect(saldo.rows[0].total).toBe(5990);
  });

  // ── Reembolso iniciado desde el ADMIN (RefundService) + webhook loopback de MP.
  // Regresión de la NC duplicada: el inbox se registra ANTES del asiento, así el
  // loopback (mismo refund id) cae como duplicado y no repite NC/monto.

  /** Stub con reembolso: getPayment para el pago y refundPayment para el admin. */
  const refundStub = (orderId: string, amount: number, refundId: string) =>
    new (class extends StubGateway {
      async refundPayment() {
        return { id: refundId, status: "approved", amount };
      }
    })({ id: "payA", status: "approved", externalReference: orderId, amount });

  const paidBooking = async (email: string) => {
    const b = await book(600, email);
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error("booking failed");
    const orderId = b.value.orderId;
    await new WebhookService(
      new StubGateway({ id: "payA", status: "approved", externalReference: orderId, amount: 9990 }),
      repo,
    ).handlePaymentNotification("payA");
    const resId = (
      await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])
    ).rows[0].id;
    return { orderId, resId };
  };

  it("reembolso admin TOTAL + loopback → exactamente UNA NC (regresión NC duplicada)", async () => {
    const { orderId, resId } = await paidBooking("h@e.cl");

    const svc = new RefundService(refundStub(orderId, 9990, "refund_adm1"), new SupabaseAdminRepository(db), repo);
    const r = await svc.cancelBooking(resId, { refundAmount: 9990 });
    expect(r.alreadyProcessed).toBe(false);

    const o = await pg.query<{ status: string; refunded_amount_clp: number; mp_refund_id: string }>(
      "select status, refunded_amount_clp, mp_refund_id from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("refunded");
    expect(o.rows[0].refunded_amount_clp).toBe(9990); // antes: cancel_booking lo dejaba en 0
    expect(o.rows[0].mp_refund_id).toBe("refund_adm1");
    const res = await pg.query<{ status: string }>("select status from reservations where id=$1", [resId]);
    expect(res.rows[0].status).toBe("cancelled");

    // Loopback de MP con el MISMO refund id → duplicado por inbox: nada cambia.
    const loop = new WebhookService(
      new StubGateway({
        id: "payA",
        status: "refunded",
        externalReference: orderId,
        amount: 9990,
        refunds: [{ id: "refund_adm1", amount: 9990, status: "approved" }],
      }),
      repo,
    );
    expect((await loop.handlePaymentNotification("payA")).result).not.toBe("refunded");

    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1); // ← el bug producía 2
    const o2 = await pg.query<{ refunded_amount_clp: number }>(
      "select refunded_amount_clp from orders where id=$1",
      [orderId],
    );
    expect(o2.rows[0].refunded_amount_clp).toBe(9990); // sin doble acumulación

    // el horario quedó libre → se puede reservar de nuevo
    expect((await book(600, "i@e.cl")).ok).toBe(true);
  });

  it("reembolso admin PARCIAL → NC(total) + boleta(saldo); loopback sin duplicar", async () => {
    const { orderId, resId } = await paidBooking("j@e.cl");

    const svc = new RefundService(refundStub(orderId, 4990, "refund_adm2"), new SupabaseAdminRepository(db), repo);
    await svc.cancelBooking(resId, { refundAmount: 4990 });

    const o = await pg.query<{ status: string; refunded_amount_clp: number }>(
      "select status, refunded_amount_clp from orders where id=$1",
      [orderId],
    );
    expect(o.rows[0].status).toBe("refunded");
    expect(o.rows[0].refunded_amount_clp).toBe(4990);

    // SII: boleta original + NC(9990) + boleta saldo (5000)
    const docs = await pg.query<{ kind: string; total: number }>(
      "select kind, total from tax_documents where order_id=$1 order by created_at",
      [orderId],
    );
    expect(docs.rows.map((d) => d.kind)).toEqual(["boleta", "nota_credito", "boleta"]);
    expect(docs.rows[1].total).toBe(9990);
    expect(docs.rows[2].total).toBe(5000);

    // Loopback parcial con el mismo id → sin cambios.
    const loop = new WebhookService(
      new StubGateway({
        id: "payA",
        status: "approved",
        externalReference: orderId,
        amount: 9990,
        refunds: [{ id: "refund_adm2", amount: 4990, status: "approved" }],
      }),
      repo,
    );
    expect((await loop.handlePaymentNotification("payA")).result).not.toBe("refunded");
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1);
  });
});
