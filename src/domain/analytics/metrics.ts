/**
 * Analíticas del admin — módulo PURO (fuente única de las definiciones de
 * métricas; ver spec 2026-07-03-analitica-admin-design.md). El repo trae filas
 * crudas acotadas; aquí vive toda la matemática, testeable con fixtures y
 * DST-safe (Luxon + helpers de scheduling/time).
 *
 * Definiciones clave:
 * - Ingresos = amount − refunded de órdenes paid/refunded, atribuidos por
 *   fecha de SESIÓN (starts_at) en tz local.
 * - Ocupación = minutos de cabina trabajando (booking o curso, confirmed,
 *   recortados al horario) ÷ minutos abiertos (opening_hours ajustado por
 *   schedule_exceptions). El bloqueo de mantención NO ocupa: la sala está cerrada.
 * - Recurrente = email con orden pagada ANTERIOR al rango (set precomputado).
 */
import { DateTime } from "luxon";
import { toLocalMinutesInterval, weekdayFor } from "@/src/domain/scheduling/time";

import { occupiesCabin, type ReservationKind } from "@/src/domain/scheduling/reservation-kind";

export interface AnalyticsOrderRow {
  id: string;
  status: string;
  amountClp: number;
  refundedAmountClp: number;
  createdAt: string;
  mpPaymentId: string | null;
  customerEmail: string | null;
  /** payment_snapshot.fee_amount (solo pagos online con snapshot). */
  feeAmount: number | null;
}

export interface AnalyticsReservationRow {
  kind: ReservationKind;
  status: "held" | "confirmed" | "cancelled" | "expired";
  startsAt: string;
  endsAt: string;
  order: AnalyticsOrderRow | null;
}

export interface AnalyticsLineRow {
  orderId: string;
  lineType: string;
  addonKey: string | null;
  description: string;
  subtotalClp: number;
}

export interface OpeningHourRow {
  weekday: number; // 0=Dom … 6=Sáb
  openMinute: number;
  closeMinute: number;
}

export interface ExceptionRow {
  date: string; // YYYY-MM-DD local
  closed: boolean;
  openMinute: number | null;
  closeMinute: number | null;
}

export interface AnalyticsInput {
  rows: AnalyticsReservationRow[];
  prevRows: AnalyticsReservationRow[];
  lines: AnalyticsLineRow[];
  /** Fechas locales YYYY-MM-DD del rango (ordenadas). */
  dates: string[];
  prevDates: string[];
  tz: string;
  bucket: "day" | "week";
  openingHours: OpeningHourRow[];
  exceptions: ExceptionRow[];
  /** Emails (lowercase) con alguna orden pagada ANTES del rango. */
  priorCustomerEmails: Set<string>;
}

export interface AnalyticsSummary {
  revenue: {
    total: number;
    prevTotal: number | null;
    deltaPct: number | null;
    refundedTotal: number;
    mpFees: number;
    buckets: { label: string; value: number }[];
  };
  occupancy: {
    pct: number;
    prevPct: number | null;
    deltaPct: number | null;
    bookedMinutes: number;
    openMinutes: number;
    byWeekday: { label: string; pct: number }[];
  };
  sessions: {
    paid: number;
    prevPaid: number | null;
    deltaPct: number | null;
    avgTicket: number | null;
  };
  funnel: {
    online: number;
    offline: number;
    courtesy: number;
    cancelled: number;
    refunded: number;
    expiredHolds: number;
  };
  addons: { key: string; label: string; count: number; attachPct: number }[];
  customers: {
    new: number;
    returning: number;
    top: { email: string; sessions: number; revenue: number }[];
    leadTimeMedianHours: number | null;
  };
}

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const isOffline = (id: string | null) => !!id && id.startsWith("offline:");
const netOf = (o: AnalyticsOrderRow) => o.amountClp - o.refundedAmountClp;
/** Sesión vendida: booking con orden pagada (o pagada y luego reembolsada). */
const isSold = (r: AnalyticsReservationRow) =>
  r.kind === "booking" && !!r.order && (r.order.status === "paid" || r.order.status === "refunded");

function deltaPct(current: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Minutos abiertos de una fecha local (excepciones mandan sobre opening_hours). */
function openMinutesFor(date: string, input: Pick<AnalyticsInput, "tz" | "openingHours" | "exceptions">): number {
  const ex = input.exceptions.find((e) => e.date === date);
  if (ex) {
    if (ex.closed) return 0;
    if (ex.openMinute != null && ex.closeMinute != null) return Math.max(0, ex.closeMinute - ex.openMinute);
  }
  const oh = input.openingHours.find((h) => h.weekday === weekdayFor(date, input.tz));
  return oh ? Math.max(0, oh.closeMinute - oh.openMinute) : 0;
}

/** Ventana [open, close) local de una fecha (para recortar reservas al horario). */
function openWindowFor(
  date: string,
  input: Pick<AnalyticsInput, "tz" | "openingHours" | "exceptions">,
): { open: number; close: number } | null {
  const ex = input.exceptions.find((e) => e.date === date);
  if (ex) {
    if (ex.closed) return null;
    if (ex.openMinute != null && ex.closeMinute != null) return { open: ex.openMinute, close: ex.closeMinute };
  }
  const oh = input.openingHours.find((h) => h.weekday === weekdayFor(date, input.tz));
  return oh ? { open: oh.openMinute, close: oh.closeMinute } : null;
}

/** Ingresos netos (monto − reembolsos) de las sesiones vendidas. Lo usan Analíticas y los KPIs de Reservas. */
export function revenueTotal(rows: AnalyticsReservationRow[]): number {
  return rows.filter(isSold).reduce((s, r) => s + netOf(r.order!), 0);
}

function occupancyFor(
  rows: AnalyticsReservationRow[],
  dates: string[],
  input: Pick<AnalyticsInput, "tz" | "openingHours" | "exceptions">,
): { booked: number; open: number } {
  let booked = 0;
  let open = 0;
  for (const date of dates) {
    open += openMinutesFor(date, input);
    const win = openWindowFor(date, input);
    if (!win) continue;
    for (const r of rows) {
      // Ocupación mide SALA TRABAJANDO, no venta: una sesión de curso ocupa la
      // cabina igual que una reserva vendida. El bloqueo de mantención no (ahí
      // la sala está cerrada, no ocupada).
      if (!occupiesCabin(r.kind) || r.status !== "confirmed") continue;
      const { start, end } = toLocalMinutesInterval(date, input.tz, r.startsAt, r.endsAt);
      booked += Math.max(0, Math.min(end, win.close) - Math.max(start, win.open));
    }
  }
  return { booked, open };
}

export function computeAnalytics(input: AnalyticsInput): AnalyticsSummary {
  const { rows, prevRows, tz } = input;
  const sold = rows.filter(isSold);

  // ── Ingresos
  const total = revenueTotal(rows);
  const prevTotal = input.prevDates.length ? revenueTotal(prevRows) : null;
  const refundedTotal = sold.reduce((s, r) => s + r.order!.refundedAmountClp, 0);
  const mpFees = sold.reduce((s, r) => s + (r.order!.feeAmount ?? 0), 0);

  // Buckets por fecha local de sesión.
  const bucketKey = (dateLocal: DateTime) =>
    input.bucket === "day" ? dateLocal.toFormat("yyyy-MM-dd") : dateLocal.startOf("week").toFormat("yyyy-MM-dd");
  const bucketKeys: string[] = [];
  const bucketLabels = new Map<string, string>();
  for (const d of input.dates) {
    const local = DateTime.fromISO(d, { zone: tz });
    const key = bucketKey(local);
    if (!bucketKeys.includes(key)) {
      bucketKeys.push(key);
      bucketLabels.set(
        key,
        input.bucket === "day"
          ? local.setLocale("es").toFormat("d LLL")
          : `sem ${DateTime.fromISO(key, { zone: tz }).setLocale("es").toFormat("d LLL")}`,
      );
    }
  }
  const bucketValues = new Map<string, number>(bucketKeys.map((k) => [k, 0]));
  for (const r of sold) {
    const key = bucketKey(DateTime.fromISO(r.startsAt).setZone(tz));
    if (bucketValues.has(key)) bucketValues.set(key, bucketValues.get(key)! + netOf(r.order!));
  }
  const buckets = bucketKeys.map((k) => ({ label: bucketLabels.get(k)!, value: bucketValues.get(k)! }));

  // ── Ocupación (+ por día de semana)
  const occ = occupancyFor(rows, input.dates, input);
  const prevOcc = input.prevDates.length ? occupancyFor(prevRows, input.prevDates, input) : null;
  const pctOf = (o: { booked: number; open: number }) => (o.open > 0 ? (o.booked / o.open) * 100 : 0);
  const byWeekdayAcc = new Map<number, { booked: number; open: number }>();
  for (const date of input.dates) {
    const w = weekdayFor(date, tz);
    const day = occupancyFor(rows, [date], input);
    const acc = byWeekdayAcc.get(w) ?? { booked: 0, open: 0 };
    byWeekdayAcc.set(w, { booked: acc.booked + day.booked, open: acc.open + day.open });
  }
  // Orden Lun..Dom (semana chilena).
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0].filter((w) => byWeekdayAcc.has(w));
  const byWeekday = weekdayOrder.map((w) => ({
    label: WEEKDAY_LABELS[w],
    pct: pctOf(byWeekdayAcc.get(w)!),
  }));

  // ── Sesiones
  const paid = sold.length;
  const prevPaid = input.prevDates.length ? prevRows.filter(isSold).length : null;

  // ── Embudo — categorías mutuamente excluyentes: online/offline = vendidas VIGENTES
  // (confirmed); cancelada = reserva cancelada sin reembolso (pago retenido o impago);
  // reembolsada gana sobre cancelada (toda reserva reembolsada quedó cancelada).
  const bookings = rows.filter((r) => r.kind === "booking");
  const vigente = (r: AnalyticsReservationRow) => r.status === "confirmed" && r.order?.status === "paid";
  const funnel = {
    online: bookings.filter((r) => vigente(r) && !!r.order!.mpPaymentId && !isOffline(r.order!.mpPaymentId)).length,
    offline: bookings.filter((r) => vigente(r) && isOffline(r.order!.mpPaymentId)).length,
    courtesy: bookings.filter((r) => !r.order && r.status === "confirmed").length,
    cancelled: bookings.filter((r) => r.status === "cancelled" && r.order?.status !== "refunded").length,
    refunded: bookings.filter((r) => r.order?.status === "refunded").length,
    expiredHolds: bookings.filter((r) => r.status === "expired").length,
  };

  // ── Add-ons (attach sobre sesiones vendidas)
  const soldOrderIds = new Set(sold.map((r) => r.order!.id));
  const byAddon = new Map<string, { label: string; orders: Set<string> }>();
  for (const l of input.lines) {
    if (!l.addonKey || !soldOrderIds.has(l.orderId)) continue;
    const entry = byAddon.get(l.addonKey) ?? { label: l.description, orders: new Set<string>() };
    entry.orders.add(l.orderId);
    byAddon.set(l.addonKey, entry);
  }
  const addons = [...byAddon.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.orders.size,
      attachPct: paid > 0 ? (v.orders.size / paid) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Clientes
  const byEmail = new Map<string, { sessions: number; revenue: number }>();
  for (const r of sold) {
    const email = r.order!.customerEmail?.trim().toLowerCase();
    if (!email) continue;
    const acc = byEmail.get(email) ?? { sessions: 0, revenue: 0 };
    byEmail.set(email, { sessions: acc.sessions + 1, revenue: acc.revenue + netOf(r.order!) });
  }
  let newCount = 0;
  let returning = 0;
  for (const email of byEmail.keys()) {
    if (input.priorCustomerEmails.has(email)) returning++;
    else newCount++;
  }
  const top = [...byEmail.entries()]
    .map(([email, v]) => ({ email, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const leadTimes = sold.map(
    (r) => DateTime.fromISO(r.startsAt).diff(DateTime.fromISO(r.order!.createdAt), "hours").hours,
  );

  return {
    revenue: { total, prevTotal, deltaPct: deltaPct(total, prevTotal), refundedTotal, mpFees, buckets },
    occupancy: {
      pct: pctOf(occ),
      prevPct: prevOcc ? pctOf(prevOcc) : null,
      deltaPct: deltaPct(pctOf(occ), prevOcc ? pctOf(prevOcc) : null),
      bookedMinutes: occ.booked,
      openMinutes: occ.open,
      byWeekday,
    },
    sessions: {
      paid,
      prevPaid,
      deltaPct: deltaPct(paid, prevPaid),
      avgTicket: paid > 0 ? Math.round(total / paid) : null,
    },
    funnel,
    addons,
    customers: { new: newCount, returning, top, leadTimeMedianHours: median(leadTimes) },
  };
}
