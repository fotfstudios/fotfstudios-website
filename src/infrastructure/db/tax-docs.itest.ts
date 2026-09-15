/**
 * Lecturas de documentos tributarios para la superficie SII del admin: columnas
 * completas (vínculo NC→boleta, is_live, settlement), docs por reserva (incluye
 * órdenes delta) y la cola de pendientes agrupada por pedido. Requiere Supabase local.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TaxDocService } from "@/src/application/admin/tax-doc-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { futureDate } from "@/tests/dates";
import { SupabaseAdminRepository } from "./admin-repository";
import { SupabaseCheckoutRepository } from "./checkout-repository";
import { SupabaseRatePlanRepository } from "./rate-plan-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const db = createServiceClient(URL, KEY);
const repo = new SupabaseAdminRepository(db);
const checkout = new CheckoutService(new PricingService(new SupabaseRatePlanRepository(db)), new SupabaseCheckoutRepository(db));
const pg = new Client({ connectionString: DB_URL });
let resourceId: string;

const cleanup =
  "truncate course_credits, course_enrollments, course_sessions, course_generations, " +
  "reservations, orders, order_lines, tax_documents, payment_intents, reschedules, booking_events, customers cascade";
const MON = futureDate(1);

const reservationOf = async (orderId: string) =>
  (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;

/** Reserva manual pagada en efectivo → 1 boleta pendiente. */
async function paid(start: number, email: string) {
  const b = await checkout.createBooking({ resourceId, date: MON, startMinute: start, durationHours: 1, customer: { email } });
  if (!b.ok) throw new Error(b.error);
  await repo.confirmOffline(b.value.orderId, "efectivo");
  return b.value.orderId;
}

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

describe("taxDocsForOrder", () => {
  it("boleta del pago con settlement = su pedido, viva, pendiente", async () => {
    const orderId = await paid(600, "a@e.cl");
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ orderId, kind: "boleta", status: "pendiente", folio: null, isLive: true, settlementOrderId: orderId, reversesDocumentId: null });
    expect(docs[0].total).toBe(docs[0].neto + docs[0].iva);
  });

  it("reembolso parcial → boleta anulada + NC enlazada + saldo en la misma tx", async () => {
    const orderId = await paid(660, "b@e.cl");
    const [orig] = await repo.taxDocsForOrder(orderId);
    await pg.query("select mark_refunded($1, $2, $3)", [orderId, "rf_1", 4000]);
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs.map((d) => d.kind)).toEqual(["boleta", "nota_credito", "boleta"]);
    expect(docs[0]).toMatchObject({ id: orig.id, isLive: false });
    expect(docs[1]).toMatchObject({ reversesDocumentId: orig.id, total: orig.total, isLive: false });
    expect(docs[2]).toMatchObject({ total: orig.total - 4000, isLive: true, settlementOrderId: orderId });
    expect(docs[2].createdAt).toBe(docs[1].createdAt);
  });
});

describe("taxDocsForReservation / taxDocsForOrderOf", () => {
  it("resuelve por la orden de la reserva y por el id de un documento", async () => {
    const orderId = await paid(720, "c@e.cl");
    const resId = await reservationOf(orderId);
    const viaRes = await repo.taxDocsForReservation(resId, orderId);
    expect(viaRes).toHaveLength(1);
    const viaDoc = await repo.taxDocsForOrderOf(viaRes[0].id);
    expect(viaDoc?.map((d) => d.id)).toEqual([viaRes[0].id]);
    expect(await repo.taxDocsForOrderOf("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("slot tomado: la boleta vive en la orden de DELTA, no en la del pedido — el fallback la trae igual", async () => {
    const orderId = await paid(900, "f@e.cl");
    const resId = await reservationOf(orderId);
    const res = (await pg.query<{ starts_at: string; ends_at: string }>("select starts_at, ends_at from reservations where id=$1", [resId])).rows[0];
    const order = (await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [orderId])).rows[0];

    // Orden de delta (financia el cobro del encarecimiento) + reschedule 'failed_slot_taken':
    // simula la rama de slot tomado de apply_reschedule_charge (20260707230000) — la reserva
    // NO se mueve y la boleta queda financiada por (y vive en) la orden de delta, no en `orderId`.
    const deltaOrder = (
      await pg.query<{ id: string }>(
        `insert into orders (status, currency, amount_clp, net_clp, tax_clp, customer_email)
           values ('paid', 'CLP', 3000, 2521, 479, $1) returning id`,
        ["f@e.cl"],
      )
    ).rows[0].id;
    await pg.query(
      `insert into reschedules
         (reservation_id, original_order_id, delta_order_id, kind, status,
          old_starts_at, old_ends_at, new_starts_at, new_ends_at, old_live_clp, new_total_clp, delta_clp)
       values ($1, $2, $3, 'charge', 'failed_slot_taken', $4, $5, $4, $5, $6, $6, 3000)`,
      [resId, orderId, deltaOrder, res.starts_at, res.ends_at, order.amount_clp],
    );
    await pg.query("select create_boleta_amount($1, $2, $1)", [deltaOrder, 3000]);

    const docs = await repo.taxDocsForReservation(resId, orderId);
    expect(docs.map((d) => ({ orderId: d.orderId, settlementOrderId: d.settlementOrderId }))).toEqual([
      { orderId, settlementOrderId: orderId },
      { orderId: deltaOrder, settlementOrderId: deltaOrder },
    ]);

    // Pasar el id de la orden de delta COMO `orderId` coincide con el que ya trae el
    // fallback de reschedules: el `Set` los funde en uno solo, así que sigue resolviendo
    // a un único documento (el de la orden de delta) — no aparece duplicado.
    const viaDelta = await repo.taxDocsForReservation(resId, deltaOrder);
    expect(viaDelta).toHaveLength(1);
    expect(viaDelta[0]).toMatchObject({ orderId: deltaOrder, settlementOrderId: deltaOrder });
  });
});

describe("pendingTaxDocsQueue / pendingTaxDocsSummary", () => {
  it("agrupa por pedido, más antiguo primero, con contexto de reserva y TODOS los docs del pedido", async () => {
    const o1 = await paid(780, "d@e.cl");
    const o2 = await paid(840, "e@e.cl");
    await pg.query("select mark_refunded($1, $2, $3)", [o1, "rf_2", 4000]);
    const q = await repo.pendingTaxDocsQueue();
    expect(q.map((g) => g.orderId)).toEqual([o1, o2]);
    expect(q[0].docs).toHaveLength(3);
    expect(q[0].context).toMatchObject({ kind: "reserva", reservationId: await reservationOf(o1) });
    const s = await repo.pendingTaxDocsSummary();
    // o1: boleta original (pendiente y anulada) + NC + saldo = 3; o2: boleta = 1.
    expect(s.count).toBe(4);
    expect(s.oldestCreatedAt).toBe(q[0].docs[0].createdAt);
  });

  it("sin pendientes → cola vacía y resumen en cero", async () => {
    expect(await repo.pendingTaxDocsQueue()).toEqual([]);
    expect(await repo.pendingTaxDocsSummary()).toEqual({ count: 0, oldestCreatedAt: null });
  });
});

describe("recordFolio (servicio + repo)", () => {
  const svc = new TaxDocService(repo);
  const events = async (resId: string) =>
    (
      await pg.query<{ type: string; detail: { folio?: string; previous_folio?: string } | null; tax_document_id: string | null }>(
        "select type, detail, tax_document_id from booking_events where reservation_id=$1 and type in ('boleta_emitted','nota_credito_emitted') order by occurred_at, seq",
        [resId],
      )
    ).rows;

  it("boleta: queda emitida con folio + emitted_at y deja boleta_emitted en el timeline", async () => {
    const orderId = await paid(600, "f@e.cl");
    const [b] = await repo.taxDocsForOrder(orderId);
    await svc.recordFolio(b.id, "1234", null);
    const after = (await repo.taxDocsForOrder(orderId))[0];
    expect(after).toMatchObject({ status: "emitida", folio: "1234" });
    expect(after.emittedAt).not.toBeNull();
    const ev = await events(await reservationOf(orderId));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "boleta_emitted", tax_document_id: b.id, detail: { folio: "1234" } });
  });

  it("NC bloqueada se rechaza; tras el folio de la boleta se registra y loguea", async () => {
    const orderId = await paid(660, "g@e.cl");
    await pg.query("select mark_refunded($1, $2, $3)", [orderId, "rf_3", 9990]);
    const [b, nc] = await repo.taxDocsForOrder(orderId);
    await expect(svc.recordFolio(nc.id, "77", null)).rejects.toThrow("Primero registra el folio de la boleta");
    await svc.recordFolio(b.id, "1234", null);
    await svc.recordFolio(nc.id, "77", null);
    const docs = await repo.taxDocsForOrder(orderId);
    expect(docs.find((d) => d.id === nc.id)).toMatchObject({ status: "emitida", folio: "77" });
    const ev = await events(await reservationOf(orderId));
    expect(ev.map((e) => e.type)).toEqual(["boleta_emitted", "nota_credito_emitted"]);
  });

  it("corregir folio conserva emitted_at y loguea previous_folio", async () => {
    const orderId = await paid(720, "h@e.cl");
    const [b] = await repo.taxDocsForOrder(orderId);
    await svc.recordFolio(b.id, "1234", null);
    const first = (await repo.taxDocsForOrder(orderId))[0].emittedAt;
    await svc.recordFolio(b.id, "1243", null);
    const after = (await repo.taxDocsForOrder(orderId))[0];
    expect(after.folio).toBe("1243");
    expect(after.emittedAt).toBe(first);
    const ev = await events(await reservationOf(orderId));
    expect(ev[1].detail).toEqual({ folio: "1243", previous_folio: "1234" });
  });
});
