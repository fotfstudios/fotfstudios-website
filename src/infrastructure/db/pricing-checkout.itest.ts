/**
 * Integración: PricingService (carga price book activo) + CheckoutService
 * (re-cotiza en servidor y persiste hold + pedido + líneas atómicamente).
 * Requiere Supabase local + envs (ver test:integration). Corre fuera del CI.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const pricing = new PricingService(new SupabaseRatePlanRepository(db));
const checkout = new CheckoutService(pricing, new SupabaseCheckoutRepository(db));
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

const MON = "2024-01-01"; // lunes

beforeAll(async () => {
  await pg.connect();
  const r = await pg.query<{ id: string }>("select id from resources limit 1");
  resourceId = r.rows[0].id;
});

afterAll(async () => {
  await pg.query("truncate reservations, orders, order_lines cascade");
  await pg.end();
});

beforeEach(async () => {
  await pg.query("truncate reservations, orders, order_lines cascade");
});

describe("PricingService.quoteBooking", () => {
  it("cotiza desde el price book activo (2h Lun = $22.480)", async () => {
    const r = await pricing.quoteBooking({ resourceId, date: MON, startMinute: 960, durationHours: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.quote.total).toBe(22480);
      expect(r.value.currency).toBe("CLP");
    }
  });
});

describe("CheckoutService.createBooking", () => {
  it("crea pedido + líneas + hold y cuadra el desglose", async () => {
    const r = await checkout.createBooking({
      resourceId,
      date: MON,
      startMinute: 960,
      durationHours: 2,
      customer: { name: "Test", email: "t@e.cl" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const order = await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [r.value.orderId]);
    expect(order.rows[0].amount_clp).toBe(22480);

    // las líneas suman exactamente el total cobrado
    const sum = await pg.query<{ s: string }>(
      "select coalesce(sum(subtotal_clp),0)::text s from order_lines where order_id=$1",
      [r.value.orderId],
    );
    expect(Number(sum.rows[0].s)).toBe(22480);

    const held = await pg.query<{ n: string }>(
      "select count(*)::text n from reservations where order_id=$1 and status='held'",
      [r.value.orderId],
    );
    expect(Number(held.rows[0].n)).toBe(1);
  });

  it("rechaza un segundo booking que se traslapa (slot_taken)", async () => {
    const first = await checkout.createBooking({
      resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "a@e.cl" },
    });
    expect(first.ok).toBe(true);

    const second = await checkout.createBooking({
      resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "b@e.cl" },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("slot_taken");
  });
});
