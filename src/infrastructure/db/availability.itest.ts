/** Integración: disponibilidad refleja el horario y lo ya reservado. */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { AvailabilityService } from "@/src/application/availability/availability-service";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { SupabaseSchedulingRepository } from "./scheduling-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const availability = new AvailabilityService(new SupabaseSchedulingRepository(db));
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

beforeAll(async () => {
  await pg.connect();
  resourceId = (await pg.query<{ id: string }>("select id from resources limit 1")).rows[0].id;
});
afterAll(async () => {
  await pg.query("truncate reservations, orders, order_lines cascade");
  await pg.end();
});
beforeEach(async () => {
  await pg.query("truncate reservations, orders, order_lines cascade");
});

describe("AvailabilityService", () => {
  it("devuelve el horario del lunes y marca lo reservado", async () => {
    const b = await checkout.createBooking({
      resourceId,
      date: "2024-01-01", // lunes
      startMinute: 600, // 10:00
      durationHours: 1,
      customer: { email: "a@e.cl" },
    });
    expect(b.ok).toBe(true);

    const r = await availability.getDayAvailability(resourceId, "2024-01-01");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.closed).toBe(false);
    expect(r.value.openMinute).toBe(540); // 09:00
    expect(r.value.closeMinute).toBe(1320); // 22:00
    expect(r.value.booked).toContainEqual({ start: 600, end: 660 });
  });
});
