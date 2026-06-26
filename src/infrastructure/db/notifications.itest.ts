/** Integración: emails de confirmación al pagar (mailer de prueba), idempotente. */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { NotificationService } from "@/src/application/notifications/notification-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseNotificationRepository } from "./notification-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

class RecordingMailer implements Mailer {
  sent: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<void> {
    this.sent.push(m);
  }
}

const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines cascade";

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

describe("NotificationService", () => {
  it("envía cliente + dueño al pagar, e idempotente", async () => {
    const b = await checkout.createBooking({
      resourceId,
      date: "2024-01-01",
      startMinute: 600,
      durationHours: 1,
      customer: { name: "Ana", email: "cliente@e.cl" },
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await pg.query("select confirm_payment($1,$2)", [b.value.orderId, "payX"]);

    const mailer = new RecordingMailer();
    const svc = new NotificationService(mailer, new SupabaseNotificationRepository(db), {
      ownerEmail: "owner@e.cl",
      tz: "America/Santiago",
      address: "Los Chercanes 78a",
      whatsappUrl: "https://wa.me/56962803298",
    });

    expect(await svc.notifyOrder(b.value.orderId)).toBe(true);
    expect(mailer.sent.length).toBe(2);
    expect(mailer.sent.map((m) => m.to)).toContain("cliente@e.cl");
    expect(mailer.sent.map((m) => m.to)).toContain("owner@e.cl");

    // segunda vez → no reenvía
    expect(await svc.notifyOrder(b.value.orderId)).toBe(false);
    expect(mailer.sent.length).toBe(2);
  });
});
