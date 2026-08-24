/** Integración: lista paginada de /admin/reservas (filtros, búsqueda, orden, conteos, KPIs). */
import { DateTime } from "luxon";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RefundService } from "@/src/application/admin/refund-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import type { PaymentGateway } from "@/src/application/ports/payment";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { parseReservasSearchParams, type ReservasListQuery } from "@/src/domain/admin/reservas-list";
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

const MON = futureDate(1);
const TUE = futureDate(2);

// Query base para tests: tiempo "todas" (sin filtro temporal) salvo que el test pida otro.
const BASE = parseReservasSearchParams({});
const q = (over: Partial<ReservasListQuery> = {}): ReservasListQuery => ({ ...BASE, tiempo: "todas", ...over });

const book = (start: number, durationHours = 1) =>
  checkout.createBooking({
    resourceId,
    date: MON,
    startMinute: start,
    durationHours,
    customer: { email: `u${start}@e.cl` },
  });
const courtesy = (date: string, customer: Parameters<typeof repo.createCourtesyBooking>[3] = {}) => {
  const { startsAt, endsAt } = rangeFor(date, 600, 1, tz);
  return repo.createCourtesyBooking(resourceId, startsAt, endsAt, customer);
};
const reservationOf = async (orderId: string) =>
  (await pg.query<{ id: string }>("select id from reservations where order_id=$1", [orderId])).rows[0].id;

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

describe("listBookings", () => {
  // Primero el supuesto más riesgoso: PostgREST ordenando por columna embebida (orders.amount_clp).
  it("orden monto: mayor monto primero, cortesía (sin pedido) al final", async () => {
    for (const [start, hours] of [
      [600, 1],
      [720, 3],
      [900, 2],
    ] as const) {
      expect((await book(start, hours)).ok).toBe(true);
    }
    await courtesy("2099-06-01");

    const r = await repo.listBookings(q({ orden: "monto" }));
    expect(r.rows).toHaveLength(4);
    const amounts = r.rows.slice(0, 3).map((x) => x.amount!);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(r.rows[3].amount).toBeNull();
  });

  it("tabs: cada estado devuelve exactamente lo suyo y los conteos calzan", async () => {
    const paid = await book(600);
    if (!paid.ok) return;
    await repo.confirmOffline(paid.value.orderId, "efectivo");
    expect((await book(660)).ok).toBe(true); // held
    const cancelled = await book(720);
    if (!cancelled.ok) return;
    await repo.cancelBooking(await reservationOf(cancelled.value.orderId));
    const expired = await book(780);
    if (!expired.ok) return;
    await pg.query("update reservations set status='expired' where order_id=$1", [expired.value.orderId]);
    const blockRange = rangeFor(TUE, 600, 1, tz);
    await repo.createBlock(resourceId, blockRange.startsAt, blockRange.endsAt);
    await courtesy("2099-06-01", { name: "Amiga" });
    // Una sesión de curso: ocupa la sala, pero NO es una reserva de cliente.
    const cursoRange = rangeFor("2099-07-01", 1200, 2, tz);
    await pg.query(
      `insert into reservations (resource_id, kind, status, starts_at, ends_at, notes)
       values ($1, 'curso', 'confirmed', $2, $3, 'Curso G01 · Sesión 1')`,
      [resourceId, cursoRange.startsAt, cursoRange.endsAt],
    );

    const todas = await repo.listBookings(q());
    expect(todas.rows).toHaveLength(7);
    expect(todas.grandTotal).toBe(7);
    expect(todas.tabCounts).toEqual({ todas: 7, confirmadas: 2, espera: 1, canceladas: 2, bloqueos: 1, curso: 1 });

    const confirmadas = await repo.listBookings(q({ estado: "confirmadas" }));
    expect(confirmadas.total).toBe(2);
    // El tab de reservas es sobre CLIENTES: ni bloqueos ni sesiones de curso.
    // El predicado es positivo a propósito — con `!== "block"` la sesión de curso
    // se habría colado acá sin que nadie lo notara.
    expect(confirmadas.rows.every((b) => b.status === "confirmed" && b.kind === "booking")).toBe(true);
    const cortesia = confirmadas.rows.find((b) => !b.orderId);
    expect(cortesia?.amount).toBeNull();

    const espera = await repo.listBookings(q({ estado: "espera" }));
    expect(espera.rows.map((b) => b.status)).toEqual(["held"]);

    const canceladas = await repo.listBookings(q({ estado: "canceladas" }));
    expect(canceladas.rows.map((b) => b.status).sort()).toEqual(["cancelled", "expired"]);

    const bloqueos = await repo.listBookings(q({ estado: "bloqueos" }));
    expect(bloqueos.rows.map((b) => b.kind)).toEqual(["block"]);

    const curso = await repo.listBookings(q({ estado: "curso" }));
    expect(curso.rows.map((b) => b.kind)).toEqual(["curso"]);
  });

  it("búsqueda por nombre (case-insensitive), email y teléfono; los conteos respetan la aguja", async () => {
    await courtesy("2099-06-01", { name: "Valentina Rojas", email: "valen@correo.cl", phone: "+56 9 1234 5678" });
    await courtesy("2099-06-02", { name: "Pedro Soto", email: "pedro@e.cl", phone: "+56 9 8765 4321" });
    const blockRange = rangeFor("2099-06-03", 600, 1, tz);
    await repo.createBlock(resourceId, blockRange.startsAt, blockRange.endsAt);

    const porNombre = await repo.listBookings(q({ q: "valentina" }));
    expect(porNombre.rows.map((b) => b.customerName)).toEqual(["Valentina Rojas"]);
    expect(porNombre.total).toBe(1);
    expect(porNombre.tabCounts).toEqual({ todas: 1, confirmadas: 1, espera: 0, canceladas: 0, bloqueos: 0, curso: 0 });
    expect(porNombre.grandTotal).toBe(3); // el total global ignora la búsqueda

    const porEmail = await repo.listBookings(q({ q: "pedro@" }));
    expect(porEmail.rows.map((b) => b.customerName)).toEqual(["Pedro Soto"]);

    const porFono = await repo.listBookings(q({ q: "8765" }));
    expect(porFono.rows.map((b) => b.customerName)).toEqual(["Pedro Soto"]);
  });

  it("aguja hostil (delimitadores y comodines) no rompe la query ni sobre-matchea", async () => {
    await courtesy("2099-06-01", { name: "Valentina Rojas" });
    for (const needle of ['a,b(%_"', "100% Ño,ño (test)", "\\"]) {
      const r = await repo.listBookings(q({ q: needle }));
      expect(Array.isArray(r.rows)).toBe(true);
    }
    // '*' NO actúa de comodín: "v*a" no debe matchear "Valentina" vía %v%a%.
    const star = await repo.listBookings(q({ q: "v*a" }));
    expect(star.rows).toHaveLength(0);
  });

  it("paginación: páginas disjuntas, total exacto, overflow vacío y orden estable", async () => {
    for (const d of ["2099-06-01", "2099-06-02", "2099-06-03", "2099-06-04", "2099-06-05"]) {
      await courtesy(d, { name: `Cliente ${d}` });
    }
    const perPage = 2;
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => repo.listBookings(q({ perPage, page }))),
    );
    expect(pages.map((p) => p.rows.length)).toEqual([2, 2, 1, 0]);
    expect(pages.every((p) => p.total === 5)).toBe(true);

    const ids = pages.flatMap((p) => p.rows.map((b) => b.id));
    expect(new Set(ids).size).toBe(5); // disjuntas y completas
    // tiempo "todas" → fecha descendente
    const dates = pages.flatMap((p) => p.rows.map((b) => b.startsAt));
    expect(dates).toEqual([...dates].sort().reverse());
    // estable entre llamadas idénticas
    const again = await repo.listBookings(q({ perPage, page: 1 }));
    expect(again.rows.map((b) => b.id)).toEqual(pages[0].rows.map((b) => b.id));
  });

  it("tiempo: próximas = en curso + futuro ascendente; pasadas = terminadas descendente", async () => {
    for (const d of ["2049-06-01", "2049-06-02", "2099-06-01", "2099-06-02"]) await courtesy(d);
    // Sesión EN CURSO respecto de nowUtc: 20:30–21:30 local del 2049-12-31
    // (23:30 UTC → 00:30 UTC del 2050-01-01) cruza la medianoche UTC.
    const enCurso = rangeFor("2049-12-31", 1230, 1, tz);
    await repo.createCourtesyBooking(resourceId, enCurso.startsAt, enCurso.endsAt, { name: "En curso" });
    const now = "2050-01-01T00:00:00.000Z";

    const proximas = await repo.listBookings(q({ tiempo: "proximas" }), now);
    expect(proximas.rows.map((b) => b.customerName ?? b.startsAt.slice(0, 4))).toEqual([
      "En curso",
      "2099",
      "2099",
    ]);
    expect(proximas.tabCounts.todas).toBe(3);

    const pasadas = await repo.listBookings(q({ tiempo: "pasadas" }), now);
    expect(pasadas.rows.map((b) => b.startsAt.slice(0, 4))).toEqual(["2049", "2049"]);
    expect(pasadas.rows[0].startsAt > pasadas.rows[1].startsAt).toBe(true);
  });

  it("filas enriquecidas: reembolso y cancelación visibles en la lista", async () => {
    const b = await book(600);
    if (!b.ok) return;
    await repo.confirmOffline(b.value.orderId, "efectivo");
    const gateway = {
      refundPayment: async () => {
        throw new Error("no debe llamarse");
      },
    } as unknown as PaymentGateway;
    const svc = new RefundService(gateway, repo, new SupabaseWebhookRepository(db));
    await svc.cancelBooking(await reservationOf(b.value.orderId), { refundAmount: b.value.amount });

    const r = await repo.listBookings(q({ estado: "canceladas" }));
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.orderStatus).toBe("refunded");
    expect(row.refundedAmount).toBe(b.value.amount);
    expect(row.refundedAt).toBeTruthy();
    expect(row.cancelledAt).toBeTruthy();
  });
});

describe("reservasKpis", () => {
  it("hoy, próximos 7 días, pagos pendientes e ingresos 30d con un seed mixto", async () => {
    // Sesión pagada HOY: se crea a futuro y se mueve a ahora (checkout veta el pasado).
    const paid = await book(600);
    if (!paid.ok) return;
    await repo.confirmOffline(paid.value.orderId, "efectivo");
    const nowIso = new Date().toISOString();
    const inOneHour = new Date(Date.now() + 3600_000).toISOString();
    await pg.query("update reservations set starts_at=$1, ends_at=$2 where order_id=$3", [
      nowIso,
      inOneHour,
      paid.value.orderId,
    ]);

    // Cortesía mañana a las 10:00 → próximos 7 días.
    const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 }).toISODate()!;
    await courtesy(tomorrow, { name: "Mañana" });

    // Pago pendiente fuera del horizonte de 7 días (no ensucia próximos7d).
    const pending = await book(720);
    if (!pending.ok) return;
    const inTenDays = DateTime.now().plus({ days: 10 });
    await pg.query("update reservations set starts_at=$1, ends_at=$2 where order_id=$3", [
      inTenDays.toISO(),
      inTenDays.plus({ hours: 1 }).toISO(),
      pending.value.orderId,
    ]);

    const kpis = await repo.reservasKpis();
    expect(kpis.sesionesHoy).toBe(1);
    expect(kpis.proximos7d).toBe(1);
    expect(kpis.pagosPendientes).toBe(1);
    expect(kpis.ingresos30d).toBe(paid.value.amount);
  });
});
