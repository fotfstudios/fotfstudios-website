/** Integración: acciones admin (reserva manual offline, cancelar/NC, bloqueos). */
import { DateTime } from "luxon";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RefundService } from "@/src/application/admin/refund-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import type { PaymentGateway } from "@/src/application/ports/payment";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { dayBoundsUtc, rangeFor } from "@/src/domain/scheduling/time";
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
// Las tablas de curso van en el MISMO truncate: course_sessions referencia
// reservations con ON DELETE RESTRICT, así que borrarlas por separado y en el
// orden equivocado falla. Incluirlas hace este archivo independiente del orden
// en que vitest corra los demás (una generación "abierta" que sobrevive de otro
// archivo choca con el índice course_generations_one_open).
const cleanup =
  "truncate course_credits, course_enrollments, course_sessions, course_generations, " +
  "reservations, orders, order_lines, tax_documents, payment_intents cascade";

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

  it("reserva manual con add-ons → líneas flat_service y suma exacta del total", async () => {
    const b = await checkout.createBooking({
      resourceId,
      date: MON,
      startMinute: 840,
      durationHours: 2,
      addonKeys: ["audio", "guided"],
      customer: { email: "addons@e.cl" },
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "transferencia");

    const lines = await pg.query<{ line_type: string; addon_key: string | null; subtotal_clp: number }>(
      "select line_type, addon_key, subtotal_clp from order_lines where order_id=$1",
      [b.value.orderId],
    );
    const addonKeys = lines.rows.filter((l) => l.line_type === "flat_service").map((l) => l.addon_key);
    expect(addonKeys).toEqual(expect.arrayContaining(["audio", "guided"]));

    const amount = (
      await pg.query<{ amount_clp: number }>("select amount_clp from orders where id=$1", [b.value.orderId])
    ).rows[0].amount_clp;
    const sum = lines.rows.reduce((s, l) => s + l.subtotal_clp, 0);
    expect(sum).toBe(amount);
    expect(b.value.amount).toBe(amount);
  });

  it("setNotesForOrder escribe las notas y devuelve el id de la reserva", async () => {
    const b = await book(900);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");

    const id = await repo.setNotesForOrder(b.value.orderId, "Pagó al llegar");
    expect(id).toBe(await reservationOf(b.value.orderId));
    const r = await pg.query<{ notes: string | null }>("select notes from reservations where id=$1", [id]);
    expect(r.rows[0].notes).toBe("Pagó al llegar");

    // Sin notas: solo resuelve el id, no toca la fila.
    const again = await repo.setNotesForOrder(b.value.orderId, null);
    expect(again).toBe(id);
    const r2 = await pg.query<{ notes: string | null }>("select notes from reservations where id=$1", [id]);
    expect(r2.rows[0].notes).toBe("Pagó al llegar");
  });

  it("cortesía con notas → 'Cortesía — …' y devuelve el id insertado", async () => {
    const { startsAt, endsAt } = rangeFor("2099-06-02", 600, 1, tz);
    const id = await repo.createCourtesyBooking(
      resourceId,
      startsAt,
      endsAt,
      { name: "Cumpleañera" },
      "Cumpleaños · Incluye: Grabación de audio",
    );
    const r = await pg.query<{ id: string; notes: string | null }>(
      "select id, notes from reservations where starts_at=$1",
      [startsAt],
    );
    expect(r.rows[0].id).toBe(id);
    expect(r.rows[0].notes).toBe("Cortesía — Cumpleaños · Incluye: Grabación de audio");
    expect((await repo.getBooking(id))?.notes).toBe("Cortesía — Cumpleaños · Incluye: Grabación de audio");
  });

  it("confirmOffline devuelve 'confirmed'; cancelUnpaidOrder libera hold + cancela la orden", async () => {
    const ok = await book(960);
    if (!ok.ok) return;
    expect(await repo.confirmOffline(ok.value.orderId, "efectivo")).toBe("confirmed");

    // Limpieza cuando el cobro no se registró: la orden sigue pendiente → cancelar.
    const pend = await book(1020);
    if (!pend.ok) return;
    await repo.cancelUnpaidOrder(pend.value.orderId);
    const o = await pg.query<{ status: string }>("select status from orders where id=$1", [pend.value.orderId]);
    expect(o.rows[0].status).toBe("cancelled");
    // horario liberado
    expect((await book(1020)).ok).toBe(true);
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

  it("bookingsOverlapping: un bloqueo que cruza medianoche cae en la ventana del día siguiente; bookingsBetween no", async () => {
    const { startsAt, endsAt } = rangeFor(TUE, 1320, 4, tz); // 22:00 → 02:00 del día siguiente
    await repo.createBlock(resourceId, startsAt, endsAt);
    const nextDay = DateTime.fromISO(TUE).plus({ days: 1 }).toISODate()!;

    const next = dayBoundsUtc(nextDay, tz);
    expect((await repo.bookingsOverlapping(next.startUtc, next.endUtc)).map((b) => b.kind)).toEqual(["block"]);
    // por starts_at (KPIs cuentan inicios) el bloqueo pertenece solo al día en que empieza
    expect(await repo.bookingsBetween(next.startUtc, next.endUtc)).toEqual([]);

    const tue = dayBoundsUtc(TUE, tz);
    expect((await repo.bookingsOverlapping(tue.startUtc, tue.endUtc)).map((b) => b.kind)).toEqual(["block"]);
    // semi-abierto: una ventana que termina justo cuando empieza el bloqueo lo excluye
    expect(await repo.bookingsOverlapping(tue.startUtc, startsAt)).toEqual([]);
  });
});

/**
 * La tarjeta "Boletas pendientes" de /admin enlaza a la ficha del pedido, pero
 * `orders.id` NO es destino: la ficha de reserva resuelve por id de RESERVA, y un
 * pedido de curso no tiene reserva en absoluto. El enlace llevaba a un 404.
 */
describe("pendingBoletas — a dónde lleva cada boleta", () => {
  it("una boleta de sala trae el id de su RESERVA, no el del pedido", async () => {
    const b = await book(600);
    if (!b.ok) throw new Error("no se pudo reservar");
    await repo.confirmOffline(b.value.orderId, "efectivo");

    const [boleta] = await repo.pendingBoletas();
    const reservationId = await reservationOf(b.value.orderId);

    expect(boleta.reservationId).toBe(reservationId);
    expect(boleta.reservationId).not.toBe(boleta.orderId); // el bug original
    expect(boleta.enrollmentId).toBeNull();
  });

  it("una boleta de curso trae el id de la INSCRIPCIÓN", async () => {
    const { rows: g } = await pg.query<{ id: string }>(
      `insert into course_generations
         (resource_id, code, name, status, seats, price_duo_clp, price_individual_clp, price_prueba_clp)
       values ($1, 'GX', 'Test', 'abierta', 6, 79990, 139990, 19990) returning id`,
      [resourceId],
    );
    const { rows: o } = await pg.query<{ create_course_enrollment: string }>(
      `select create_course_enrollment($1, 'individual',
         '[{"name":"Camila","email":"cami@correo.cl"}]'::jsonb, 139990, 117639, 22351)`,
      [g[0].id],
    );
    const orderId = o[0].create_course_enrollment;
    await pg.query("select confirm_course_payment($1, 'offline:efectivo', 'efectivo')", [orderId]);

    const [boleta] = await repo.pendingBoletas();
    const { rows: e } = await pg.query<{ id: string }>(
      "select id from course_enrollments where order_id = $1", [orderId]);

    expect(boleta.enrollmentId).toBe(e[0].id);
    // Un pedido de curso no tiene reserva: por eso el enlace viejo era imposible.
    expect(boleta.reservationId).toBeNull();
  });
});
