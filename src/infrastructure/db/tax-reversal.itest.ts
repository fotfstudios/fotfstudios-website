/**
 * Modelo de reversión de documentos tributarios (D4): un NC apunta explícitamente
 * a la boleta que anula (reverses_document_id) y cada boleta lleva su reversión
 * acumulada (reversed_clp) como propiedad de fila consultable (is_live). El helper
 * create_nota_credito_amount pasa a 3 args (order, boleta, total) y copia el
 * neto/IVA de la boleta objetivo (reversa exacta, sin deriva del ratio del pedido).
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

const MON = futureDate(1);
const pay = async (orderId: string, paymentId: string, amount: number) => {
  const svc = new WebhookService(new StubGateway({ id: paymentId, status: "approved", externalReference: orderId, amount }), webhookRepo);
  return (await svc.handlePaymentNotification(paymentId)).result;
};

/** Reserva pagada 9990 → una boleta viva. Devuelve orderId + su boleta. */
async function paidBooking(start: number, paymentId: string) {
  const b = await checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email: "tr@e.cl" } });
  if (!b.ok) throw new Error(`book failed: ${b.error}`);
  expect(await pay(b.value.orderId, paymentId, 9990)).toBe("paid");
  const bo = await pg.query<{ id: string; neto: number; iva: number; total: number }>(
    "select id, neto, iva, total from tax_documents where order_id=$1 and kind='boleta'", [b.value.orderId]);
  return { orderId: b.value.orderId, boleta: bo.rows[0] };
}

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

describe("tax reversal model — columns & live boletas", () => {
  it("una boleta recién pagada está viva: reversed_clp=0, is_live=true, order_live_boletas la lista", async () => {
    const { orderId, boleta } = await paidBooking(600, "trp1");
    const row = await pg.query<{ reversed: number; is_live: boolean }>(
      "select reversed_clp reversed, is_live from tax_documents where id=$1", [boleta.id]);
    expect(row.rows[0]).toMatchObject({ reversed: 0, is_live: true });
    const live = await pg.query<{ id: string; live_amount: number }>("select * from order_live_boletas($1)", [orderId]);
    expect(live.rows).toHaveLength(1);
    expect(live.rows[0]).toMatchObject({ id: boleta.id, live_amount: 9990 });
  });
});

describe("create_nota_credito_amount(order, boleta, total) — linked reversal", () => {
  it("NC total anula la boleta: reverses_document_id set, neto/iva copiados, reversed_clp=total, is_live=false", async () => {
    const { orderId, boleta } = await paidBooking(600, "trp2");
    const nc = await pg.query<{ id: string }>("select create_nota_credito_amount($1,$2,$3) id", [orderId, boleta.id, 9990]);
    const ncRow = await pg.query<{ kind: string; reverses: string; neto: number; iva: number; total: number }>(
      "select kind, reverses_document_id reverses, neto, iva, total from tax_documents where id=$1", [nc.rows[0].id]);
    expect(ncRow.rows[0]).toMatchObject({ kind: "nota_credito", reverses: boleta.id, neto: boleta.neto, iva: boleta.iva, total: 9990 });
    const bo = await pg.query<{ reversed: number; is_live: boolean }>(
      "select reversed_clp reversed, is_live from tax_documents where id=$1", [boleta.id]);
    expect(bo.rows[0]).toMatchObject({ reversed: 9990, is_live: false });
    expect((await pg.query("select * from order_live_boletas($1)", [orderId])).rows).toHaveLength(0);
  });

  it("NC parcial deja la boleta viva por el saldo; una segunda NC la termina de anular", async () => {
    const { orderId, boleta } = await paidBooking(600, "trp3");
    await pg.query("select create_nota_credito_amount($1,$2,$3)", [orderId, boleta.id, 4000]);
    const live = await pg.query<{ live_amount: number }>("select * from order_live_boletas($1)", [orderId]);
    expect(live.rows[0].live_amount).toBe(5990);
    await pg.query("select create_nota_credito_amount($1,$2,$3)", [orderId, boleta.id, 5990]);
    expect((await pg.query("select * from order_live_boletas($1)", [orderId])).rows).toHaveLength(0);
  });

  it("total 0 → return null, sin fila de $0 (guard preservado)", async () => {
    const { orderId, boleta } = await paidBooking(600, "trp4");
    const nc = await pg.query<{ id: string | null }>("select create_nota_credito_amount($1,$2,0) id", [orderId, boleta.id]);
    expect(nc.rows[0].id).toBeNull();
    expect((await pg.query<{ n: string }>("select count(*)::text n from tax_documents where order_id=$1 and total=0", [orderId])).rows[0].n).toBe("0");
  });
});

describe("tax reversal trigger — guards", () => {
  it("una NC no puede sobre-anular una boleta (total > saldo) → aborta", async () => {
    const { orderId, boleta } = await paidBooking(600, "trg1");
    await expect(pg.query("select create_nota_credito_amount($1,$2,$3)", [orderId, boleta.id, 12000])).rejects.toThrow(
      /reverses_exceeds_boleta_total/,
    );
  });

  it("una NC no puede apuntar a una boleta de OTRO pedido → aborta", async () => {
    const a = await paidBooking(600, "trg2a");
    const b = await paidBooking(720, "trg2b");
    // NC en el pedido a apuntando a la boleta del pedido b.
    await expect(pg.query("select create_nota_credito_amount($1,$2,$3)", [a.orderId, b.boleta.id, 9990])).rejects.toThrow(
      /reverses_target_wrong_order/,
    );
  });
});
