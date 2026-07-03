/** Integración: acciones admin (reserva manual offline, cancelar/NC, bloqueos). */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RefundService } from "@/src/application/admin/refund-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import type { PaymentGateway } from "@/src/application/ports/payment";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { rangeFor } from "@/src/domain/scheduling/time";
import { futureDate } from "@/tests/dates";
import { SupabaseAdminRepository } from "./admin-repository";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";
import { SupabaseWebhookRepository } from "./webhook-repository";

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

const MON = futureDate(1); // lunes futuro
const TUE = futureDate(2); // martes futuro

const reservationOf = async (orderId: string) =>
  (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;
const book = (start: number) =>
  checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email: `u${start}@e.cl` } });

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

  it("cancelar reserva pagada CON reembolso (offline vía RefundService) → refunded + NC + monto + libera", async () => {
    const b = await book(660);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");

    // Pago offline → RefundService no llama a MP; el gateway no debe usarse.
    const gateway = { refundPayment: async () => { throw new Error("no debe llamarse"); } } as unknown as PaymentGateway;
    const svc = new RefundService(gateway, repo, new SupabaseWebhookRepository(db));
    const amount = (
      await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [b.value.orderId])
    ).rows[0].amount_clp;
    await svc.cancelBooking(await reservationOf(b.value.orderId), { refundAmount: amount });

    const o = await pg.query<{ status: string; mp_refund_id: string | null; refunded_amount_clp: number }>(
      "select status, mp_refund_id, refunded_amount_clp from orders where id=$1",
      [b.value.orderId],
    );
    expect(o.rows[0].status).toBe("refunded");
    expect(o.rows[0].mp_refund_id).toBe("offline:manual");
    expect(o.rows[0].refunded_amount_clp).toBe(amount); // antes: cancel_booking lo dejaba en 0
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [b.value.orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(1);
    // horario liberado
    expect((await book(660)).ok).toBe(true);
  });

  it("cancelar reserva pagada SIN reembolso → sigue 'paid', sin NC, libera el horario", async () => {
    const b = await book(665);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");
    await repo.cancelBooking(await reservationOf(b.value.orderId)); // sin refund id

    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("paid"); // dinero retenido (no-show)
    const nc = await pg.query<{ n: string }>(
      "select count(*)::text n from tax_documents where order_id=$1 and kind='nota_credito'",
      [b.value.orderId],
    );
    expect(Number(nc.rows[0].n)).toBe(0);
    // horario igual quedó liberado
    expect((await book(665)).ok).toBe(true);
  });

  it("cancelar reserva no pagada → cancelada + sella cancelled_at + libera el horario", async () => {
    const b = await book(720);
    if (!b.ok) return;
    const resId = await reservationOf(b.value.orderId);
    await repo.cancelBooking(resId);
    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [b.value.orderId]);
    expect(o.rows[0].status).toBe("cancelled");
    // timestamp real de cancelación (para la actividad del admin)
    const r = await pg.query<{ cancelled_at: string | null }>(
      "select cancelled_at from reservations where id=$1",
      [resId],
    );
    expect(r.rows[0].cancelled_at).not.toBeNull();
    expect((await book(720)).ok).toBe(true);
  });

  it("cortesía: reserva confirmada sin pedido ni boleta, bloquea el horario y es cancelable", async () => {
    const { startsAt, endsAt } = rangeFor("2099-06-01", 600, 1, tz);
    await repo.createCourtesyBooking(resourceId, startsAt, endsAt, { name: "Amigo", email: "amigo@e.cl" });

    const rows = await pg.query<{ id: string; status: string; kind: string; order_id: string | null; notes: string | null }>(
      "select id, status, kind, order_id, notes from reservations where starts_at=$1",
      [startsAt],
    );
    expect(rows.rows).toHaveLength(1);
    const res = rows.rows[0];
    expect(res.status).toBe("confirmed");
    expect(res.kind).toBe("booking");
    expect(res.order_id).toBeNull();
    expect(res.notes).toBe("Cortesía");

    const detail = await repo.getBooking(res.id);
    expect(detail?.orderId).toBeNull();
    expect(detail?.amount).toBeNull();
    expect(detail?.lines).toHaveLength(0);
    expect(detail?.taxDocs).toHaveLength(0);

    const boleta = await pg.query<{ n: string }>("select count(*)::text n from tax_documents", []);
    expect(Number(boleta.rows[0].n)).toBe(0);

    // bloquea el horario (overlap → slot_taken)
    await expect(repo.createCourtesyBooking(resourceId, startsAt, endsAt, {})).rejects.toThrow("slot_taken");

    // cancelable sin pedido: sólo cambia el estado
    await repo.cancelBooking(res.id);
    const after = await pg.query<{ status: string }>("select status from reservations where id=$1", [res.id]);
    expect(after.rows[0].status).toBe("cancelled");
  });

  it("un bloqueo impide reservar y rechaza solaparse", async () => {
    const { startsAt, endsAt } = rangeFor(TUE, 600, 1, tz);
    await repo.createBlock(resourceId, startsAt, endsAt);

    const conflict = await checkout.createBooking({
      resourceId,
      date: TUE,
      startMinute: 600,
      durationHours: 1,
      customer: { email: "x@e.cl" },
    });
    expect(conflict.ok).toBe(false);

    await expect(repo.createBlock(resourceId, startsAt, endsAt)).rejects.toThrow();
  });
});
