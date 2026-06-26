/**
 * Integración del webhook: confirma/cancela un pedido a partir del estado del
 * pago (gateway stub → no necesita MP). Verifica idempotencia y liberación de
 * horario. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import type { PaymentGateway, PaymentInfo, PreferenceResult } from "@/src/application/ports/payment";
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
}

const book = (start: number, email: string) =>
  checkout.createBooking({ resourceId, date: "2024-01-01", startMinute: start, durationHours: 1, customer: { email } });

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
      new StubGateway({ id: "pay1", status: "approved", externalReference: orderId, amount: 9990 }),
      repo,
    );
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("paid");

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("paid");
    const r = await pg.query<{ status: string }>("select status from reservations where order_id=$1", [orderId]);
    expect(r.rows[0].status).toBe("confirmed");

    // misma notificación otra vez → no reprocesa
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
  });

  it("rejected → cancela y libera el horario", async () => {
    const b = await book(600, "b@e.cl");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const orderId = b.value.orderId;

    const svc = new WebhookService(
      new StubGateway({ id: "pay2", status: "rejected", externalReference: orderId }),
      repo,
    );
    expect((await svc.handlePaymentNotification("pay2")).result).toBe("cancelled");

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [orderId]);
    expect(o.rows[0].status).toBe("cancelled");

    // el horario quedó libre → se puede reservar de nuevo
    const b2 = await book(600, "c@e.cl");
    expect(b2.ok).toBe(true);
  });
});
