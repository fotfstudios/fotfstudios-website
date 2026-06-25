/**
 * Integración Mercado Pago (Checkout Pro, sandbox). Crea un pedido (checkout)
 * y genera una preference REAL → init_point. Requiere MP_ACCESS_TOKEN de prueba
 * en .env.local + Supabase local. Se omite si no hay token.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PaymentService } from "@/src/application/payment/payment-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseCheckoutRepository } from "@/src/infrastructure/db/checkout-repository";
import { SupabaseOrderRepository } from "@/src/infrastructure/db/order-repository";
import { SupabaseRatePlanRepository } from "@/src/infrastructure/db/rate-plan-repository";
import { createServiceClient } from "@/src/infrastructure/db/supabase-client";
import { MercadoPagoGateway } from "./mercadopago-gateway";

const TOKEN = process.env.MP_ACCESS_TOKEN ?? "";
const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query("truncate reservations, orders, order_lines, payment_intents cascade");
  await pg.end();
});
beforeEach(async () => {
  await pg.query("truncate reservations, orders, order_lines, payment_intents cascade");
});

describe.skipIf(!TOKEN)("MercadoPago Checkout Pro (sandbox)", () => {
  it("crea pedido → preference y devuelve init_point", async () => {
    const db = createServiceClient(URL, KEY);
    const pricing = new PricingService(new SupabaseRatePlanRepository(db));
    const checkout = new CheckoutService(pricing, new SupabaseCheckoutRepository(db));
    const payment = new PaymentService(new MercadoPagoGateway(TOKEN), new SupabaseOrderRepository(db), {
      siteUrl: "https://fotfstudios.cl",
    });

    const booking = await checkout.createBooking({
      resourceId,
      date: "2024-01-01",
      startMinute: 600,
      durationHours: 1,
      customer: { email: "test_user_123@testuser.com" },
    });
    expect(booking.ok).toBe(true);
    if (!booking.ok) return;

    const pref = await payment.createPreferenceForOrder(booking.value.orderId);
    expect(pref.ok).toBe(true);
    if (!pref.ok) return;
    expect(pref.value.initPoint).toMatch(/^https:\/\//);
    expect(pref.value.preferenceId).toBeTruthy();

    const pi = await pg.query<{ n: string }>(
      "select count(*)::text n from payment_intents where order_id=$1",
      [booking.value.orderId],
    );
    expect(Number(pi.rows[0].n)).toBe(1);
    const o = await pg.query<{ mp_preference_id: string }>(
      "select mp_preference_id from orders where id=$1",
      [booking.value.orderId],
    );
    expect(o.rows[0].mp_preference_id).toBe(pref.value.preferenceId);
  });
});
