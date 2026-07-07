/**
 * B1 Task 1: `create_checkout` con `p_ttl` nullable → hold firme (expires_at NULL).
 * Verifica el fundamento del ciclo de pago manual: un hold sin TTL sigue bloqueando
 * el slot vía la exclusion constraint GiST (que filtra por status, no por
 * expires_at) y `expire_stale_holds` lo ignora (NULL < now() es falso, nunca lo
 * expira). Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { futureDate } from "@/tests/dates";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const pg = new Client({ connectionString: DB_URL });
const db = createServiceClient(URL, KEY);
const checkout = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
let resourceId: string;
const cleanup = "truncate reservations, orders, order_lines, payment_intents, webhook_events, tax_documents, reschedules cascade";
const MON = futureDate(1);
const startsAt = () => `${MON}T14:00:00-04:00`;
const endsAt = () => `${MON}T15:00:00-04:00`;

const lines1h = JSON.stringify([
  { line_type: "room_time", description: "Sala · 1h", quantity: 1, unit_price_clp: 9990, subtotal_clp: 9990 },
]);

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

/**
 * Llama create_checkout con p_ttl NULL (hold firme). Firma real (15 params,
 * ver 20260707120000_order_terms_consent.sql:19-99): create_checkout devuelve
 * un uuid escalar (order_id), no una fila con reservation_id → se resuelve la
 * reserva por order_id tras el insert. Se usa notación con nombre para no
 * depender del orden posicional completo (solo se fijan los params sin default
 * que necesita el test, más p_ttl).
 */
async function firmCheckout() {
  const { rows } = await pg.query<{ order_id: string }>(
    `select create_checkout(
       p_resource      => $1::uuid,
       p_starts        => $2::timestamptz,
       p_ends          => $3::timestamptz,
       p_amount        => $4::int,
       p_net           => $5::int,
       p_tax           => $6::int,
       p_currency      => $7::text,
       p_customer      => $8::jsonb,
       p_snapshot      => $9::jsonb,
       p_lines         => $10::jsonb,
       p_ttl           => null,
       p_terms_source  => 'staff'
     ) as order_id`,
    [
      resourceId,
      startsAt(),
      endsAt(),
      9990,
      8395,
      1595,
      "CLP",
      JSON.stringify({ name: "Manual", email: "m@e.cl" }),
      JSON.stringify({}),
      lines1h,
    ],
  );
  const orderId = rows[0].order_id;
  const res = await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId]);
  return { orderId, reservationId: res.rows[0].id };
}

describe("create_checkout con hold firme (p_ttl NULL)", () => {
  it("crea reserva held con expires_at NULL y orden pending_payment", async () => {
    const { orderId, reservationId } = await firmCheckout();
    const res = await pg.query<{ status: string; expires_at: string | null }>(
      "select status, expires_at from reservations where id=$1", [reservationId]);
    expect(res.rows[0]).toMatchObject({ status: "held", expires_at: null });
    expect((await pg.query<{ status: string }>("select status from orders where id=$1", [orderId])).rows[0].status).toBe("pending_payment");
  });

  it("el hold firme bloquea el slot vía GiST aunque no expire", async () => {
    await firmCheckout();
    await expect(firmCheckout()).rejects.toThrow(); // 23P01 exclusion_violation
  });
});

// Enhebrado por la capa app (Step 5): CheckoutService → SupabaseCheckoutRepository →
// create_checkout. opts.firmHold es la vía real que usará la reserva manual pendiente
// de B1; sin la opción, el checkout del cliente debe seguir con el hold de 10 min.
describe("CheckoutService.createBooking con opts.firmHold", () => {
  it("firmHold:true produce un hold sin expires_at (reserva manual pendiente)", async () => {
    const res = await checkout.createBooking(
      { resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "manual@e.cl" } },
      { firmHold: true },
    );
    if (!res.ok) throw new Error(`book failed: ${res.error}`);
    const r = await pg.query<{ status: string; expires_at: string | null }>(
      "select status, expires_at from reservations where order_id=$1", [res.value.orderId]);
    expect(r.rows[0]).toMatchObject({ status: "held", expires_at: null });
  });

  it("sin opts (checkout del cliente) mantiene el hold de 10 min, sin cambios", async () => {
    const res = await checkout.createBooking({ resourceId, date: MON, startMinute: 600, durationHours: 1, customer: { email: "cliente@e.cl" } });
    if (!res.ok) throw new Error(`book failed: ${res.error}`);
    const r = await pg.query<{ expires_at: string | null }>(
      "select expires_at from reservations where order_id=$1", [res.value.orderId]);
    expect(r.rows[0].expires_at).not.toBeNull();
    const minutesLeft = (new Date(r.rows[0].expires_at as string).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(8);
    expect(minutesLeft).toBeLessThan(11);
  });
});
