/** Integración: acciones admin (reserva manual offline, cancelar/NC, bloqueos). */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { rangeFor } from "@/src/domain/scheduling/time";
import { SupabaseAdminRepository } from "./admin-repository";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseAdminRepository(db);
const checkout = new CheckoutService(
  new PricingService(new SupabaseRatePlanRepository(db)),
  new SupabaseCheckoutRepository(db),
);
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;
let tz: string;
const cleanup = "truncate reservations, orders, order_lines, tax_documents, payment_intents cascade";

const reservationOf = async (orderId: string) =>
  (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;
const book = (start: number) =>
  checkout.createBooking({ resourceId, date: "2024-01-01", startMinute: start, durationHours: 1, customer: { email: `u${start}@e.cl` } });

beforeAll(async () => {
  await pg.connect();
  const r = await repo.defaultResource();
  resourceId = r!.id;
  tz = r!.timezone;
});
afterAll(async () => {
  await pg.query(cleanup);
  await pg.end();
});
beforeEach(async () => {
  await pg.query(cleanup);
});

describe("admin actions", () => {
  it("reserva manual offline queda pagada + con boleta", async () => {
    const b = await book(600);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("paid");
    const boleta = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='boleta'",
      [b.value.orderId],
    );
    expect(Number(boleta.rows[0].n)).toBe(1);
  });

  it("cancelar reserva pagada → reembolsada + NC + libera el horario", async () => {
    const b = await book(660);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");
    await repo.cancelBooking(await reservationOf(b.value.orderId));

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("refunded");
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [b.value.orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1);
    // horario liberado
    expect((await book(660)).ok).toBe(true);
  });

  it("cancelar reserva no pagada → cancelada + libera el horario", async () => {
    const b = await book(720);
    if (!b.ok) return;
    await repo.cancelBooking(await reservationOf(b.value.orderId));
    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("cancelled");
    expect((await book(720)).ok).toBe(true);
  });

  it("un bloqueo impide reservar y rechaza solaparse", async () => {
    const { startsAt, endsAt } = rangeFor("2024-01-02", 600, 1, tz);
    await repo.createBlock(resourceId, startsAt, endsAt);

    const conflict = await checkout.createBooking({
      resourceId,
      date: "2024-01-02",
      startMinute: 600,
      durationHours: 1,
      customer: { email: "x@e.cl" },
    });
    expect(conflict.ok).toBe(false);

    await expect(repo.createBlock(resourceId, startsAt, endsAt)).rejects.toThrow();
  });
});
