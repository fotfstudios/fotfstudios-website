import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESERVA_TABS,
  escapeIlike,
  ordenSpec,
  type ReservaTab,
  type ReservasListQuery,
} from "@/src/domain/admin/reservas-list";
import {
  revenueTotal,
  type AnalyticsLineRow,
  type AnalyticsReservationRow,
  type ExceptionRow,
  type OpeningHourRow,
} from "@/src/domain/analytics/metrics";
import type { Database } from "./database.types";

const TZ = "America/Santiago";

export interface AdminBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  kind: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  orderId: string | null;
  amount: number | null;
  orderStatus: string | null;
  accessCode: string | null;
  accessSentAt: string | null;
  createdAt: string;
  paidAt: string | null;
  notes: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  refundedAmount: number | null;
}

/** Snapshot del pago de MP (subconjunto guardado en orders.payment_snapshot). */
export interface PaymentSnapshot {
  payment_type_id: string | null;
  payment_method_id: string | null;
  card_last4: string | null;
  installments: number | null;
  gross_amount: number | null;
  fee_amount: number | null;
  net_received_amount: number | null;
  date_approved: string | null;
  payer_email: string | null;
  payer_name: string | null;
}

export interface AdminBookingDetail extends AdminBooking {
  lines: { description: string; subtotal: number }[];
  /** addon_keys del pedido — para re-cotizar el mismo servicio al reagendar. */
  addonKeys: string[];
  /** Puntos canjeados (CLP). >0 bloquea el reagendamiento en v1. */
  pointsRedeemedClp: number;
  taxDocs: { id: string; kind: string; status: string; folio: string | null; total: number }[];
  /** Eventos de reagendamiento (auditoría) para la línea de tiempo. */
  reschedules: {
    kind: string; // equal | refund | charge
    status: string; // applied | pending_charge | failed_slot_taken | expired | cancelled
    oldStartsAt: string;
    newStartsAt: string;
    deltaClp: number;
    createdAt: string;
    appliedAt: string | null;
  }[];
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  mpRefundId: string | null;
  paymentSnapshot: PaymentSnapshot | null;
}

export interface ReservasListResult {
  rows: AdminBooking[];
  /** Conteo exacto del tab activo (== tabCounts[estado]). */
  total: number;
  /** Conteos por tab; respetan la búsqueda y el tiempo, NO el tab activo. */
  tabCounts: Record<ReservaTab, number>;
  /** Reservas totales sin filtro alguno (distingue "sin datos" de "sin resultados"). */
  grandTotal: number;
}

export interface ReservasKpis {
  sesionesHoy: number;
  proximos7d: number;
  pagosPendientes: number;
  ingresos30d: number;
}

export interface DashboardData {
  todaySessions: number;
  weekRevenue: number;
  weekOccupancyPct: number;
  pendingBoletas: number;
  pendingPayments: number;
  accessToSend: number;
  today: AdminBooking[];
  upcoming: AdminBooking[];
  boletas: PendingBoleta[];
}

export interface PendingBoleta {
  id: string;
  orderId: string;
  kind: string;
  neto: number;
  iva: number;
  total: number;
  createdAt: string;
}

type ResRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  kind: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  access_code: string | null;
  access_sent_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  notes: string | null;
  order_id: string | null;
  orders: {
    amount_clp: number;
    status: string;
    paid_at: string | null;
    refunded_at: string | null;
    refunded_amount_clp: number | null;
  } | null;
};

const SELECT =
  "id, starts_at, ends_at, status, kind, customer_name, customer_email, customer_phone, access_code, access_sent_at, created_at, cancelled_at, notes, order_id, orders(amount_clp, status, paid_at, refunded_at, refunded_amount_clp)";

/** Subconjunto estructural del query builder de PostgREST que usan los filtros de la lista. */
interface ReservasFilterable {
  or(filters: string): this;
  gte(column: string, value: string): this;
  lt(column: string, value: string): this;
  eq(column: string, value: string): this;
  neq(column: string, value: string): this;
  in(column: string, values: string[]): this;
}

const map = (r: ResRow): AdminBooking => ({
  id: r.id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  kind: r.kind,
  customerName: r.customer_name,
  customerEmail: r.customer_email,
  customerPhone: r.customer_phone,
  accessCode: r.access_code,
  accessSentAt: r.access_sent_at,
  orderId: r.order_id,
  amount: r.orders?.amount_clp ?? null,
  orderStatus: r.orders?.status ?? null,
  createdAt: r.created_at,
  paidAt: r.orders?.paid_at ?? null,
  notes: r.notes,
  cancelledAt: r.cancelled_at,
  refundedAt: r.orders?.refunded_at ?? null,
  refundedAmount: r.orders?.refunded_amount_clp ?? null,
});

export class SupabaseAdminRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // ── lecturas
  async upcomingBookings(limit = 30): Promise<AdminBooking[]> {
    const { data } = await this.db
      .from("reservations")
      .select(SELECT)
      .in("status", ["held", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    return ((data as unknown as ResRow[]) ?? []).map(map);
  }

  /**
   * Lista paginada de /admin/reservas: filtros (tab/tiempo/búsqueda), orden y
   * conteos en una sola pasada (7 queries en paralelo). La página de datos NO
   * pide count (un offset fuera de rango devuelve [] en vez de 416); el total
   * del tab activo sale del mismo head-count que alimenta su badge, así lista
   * y conteos comparten filtros y no pueden divergir.
   */
  async listBookings(qy: ReservasListQuery, nowUtc = new Date().toISOString()): Promise<ReservasListResult> {
    const orden = ordenSpec(qy);
    const from = (qy.page - 1) * qy.perPage;

    const dataQ = this.reservasFiltered(this.db.from("reservations").select(SELECT), qy, qy.estado, nowUtc)
      .order(orden.column, { ascending: orden.ascending, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + qy.perPage - 1);
    const countFor = (tab: ReservaTab) =>
      this.reservasFiltered(
        this.db.from("reservations").select("id", { count: "exact", head: true }),
        qy,
        tab,
        nowUtc,
      );
    const grandQ = this.db.from("reservations").select("id", { count: "exact", head: true });

    const [data, grand, ...counts] = await Promise.all([dataQ, grandQ, ...RESERVA_TABS.map(countFor)]);
    const failed = [data, grand, ...counts].find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    const tabCounts = Object.fromEntries(
      RESERVA_TABS.map((tab, i) => [tab, counts[i].count ?? 0]),
    ) as Record<ReservaTab, number>;
    return {
      rows: ((data.data as unknown as ResRow[]) ?? []).map(map),
      total: tabCounts[qy.estado],
      tabCounts,
      grandTotal: grand.count ?? 0,
    };
  }

  /** KPIs del encabezado de /admin/reservas (globales, no dependen de los filtros). */
  async reservasKpis(): Promise<ReservasKpis> {
    const todayStart = DateTime.now().setZone(TZ).startOf("day");
    const todayEnd = todayStart.plus({ days: 1 });
    const horizon = todayEnd.plus({ days: 7 });
    const last30Start = todayStart.minus({ days: 29 });

    const [agenda, pendingPay, last30] = await Promise.all([
      this.bookingsBetween(todayStart.toUTC().toISO()!, horizon.toUTC().toISO()!),
      this.db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
      this.analyticsReservations(last30Start.toUTC().toISO()!, todayEnd.toUTC().toISO()!),
    ]);

    const sessions = agenda.filter((b) => b.kind !== "block");
    const sesionesHoy = sessions.filter((b) => DateTime.fromISO(b.startsAt) < todayEnd).length;
    return {
      sesionesHoy,
      proximos7d: sessions.length - sesionesHoy,
      pagosPendientes: pendingPay.count ?? 0,
      ingresos30d: revenueTotal(last30),
    };
  }

  /** Aplica búsqueda + tiempo + tab sobre un builder de `reservations` (lista y conteos comparten esto). */
  private reservasFiltered<B extends ReservasFilterable>(
    qb: B,
    qy: ReservasListQuery,
    tab: ReservaTab,
    nowUtc: string,
  ): B {
    const needle = escapeIlike(qy.q);
    if (needle) {
      qb = qb.or(
        `customer_name.ilike.%${needle}%,customer_email.ilike.%${needle}%,customer_phone.ilike.%${needle}%`,
      );
    }
    // El corte temporal es por ends_at: una sesión EN CURSO sigue en "próximas"
    // (lo que está pasando en la cabina es lo más relevante del default).
    if (qy.tiempo === "proximas") qb = qb.gte("ends_at", nowUtc);
    else if (qy.tiempo === "pasadas") qb = qb.lt("ends_at", nowUtc);
    switch (tab) {
      case "confirmadas":
        return qb.neq("kind", "block").eq("status", "confirmed");
      case "espera":
        return qb.eq("status", "held");
      case "canceladas":
        return qb.in("status", ["cancelled", "expired"]);
      case "bloqueos":
        return qb.eq("kind", "block");
      default:
        return qb;
    }
  }

  /** Reservas activas (todas las clases) que caen en [startUtc, endUtc). Para agenda + KPIs. */
  async bookingsBetween(startUtc: string, endUtc: string): Promise<AdminBooking[]> {
    const { data } = await this.db
      .from("reservations")
      .select(SELECT)
      .in("status", ["held", "confirmed"])
      .gte("starts_at", startUtc)
      .lt("starts_at", endUtc)
      .order("starts_at", { ascending: true });
    return ((data as unknown as ResRow[]) ?? []).map(map);
  }

  /**
   * Reservas activas que SOLAPAN [startUtc, endUtc) — la grilla del calendario:
   * un bloqueo que cruza medianoche debe aparecer también en el día siguiente.
   * `bookingsBetween` (por starts_at) queda para KPIs, que cuentan inicios.
   */
  async bookingsOverlapping(startUtc: string, endUtc: string): Promise<AdminBooking[]> {
    const { data } = await this.db
      .from("reservations")
      .select(SELECT)
      .in("status", ["held", "confirmed"])
      .lt("starts_at", endUtc)
      .gt("ends_at", startUtc)
      .order("starts_at", { ascending: true });
    return ((data as unknown as ResRow[]) ?? []).map(map);
  }

  // ── analíticas (filas crudas para src/domain/analytics/metrics; acotadas)

  /** Reservas de TODOS los estados en [startUtc, endUtc) con la orden ampliada. */
  async analyticsReservations(startUtc: string, endUtc: string): Promise<AnalyticsReservationRow[]> {
    const { data } = await this.db
      .from("reservations")
      .select(
        "kind, status, starts_at, ends_at, orders(id, status, amount_clp, refunded_amount_clp, created_at, mp_payment_id, customer_email, payment_snapshot)",
      )
      .gte("starts_at", startUtc)
      .lt("starts_at", endUtc)
      .order("starts_at", { ascending: true });
    type Row = {
      kind: "booking" | "block";
      status: "held" | "confirmed" | "cancelled" | "expired";
      starts_at: string;
      ends_at: string;
      orders: {
        id: string;
        status: string;
        amount_clp: number;
        refunded_amount_clp: number | null;
        created_at: string;
        mp_payment_id: string | null;
        customer_email: string | null;
        payment_snapshot: { fee_amount?: number | null } | null;
      } | null;
    };
    return ((data as unknown as Row[]) ?? []).map((r) => ({
      kind: r.kind,
      status: r.status,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      order: r.orders
        ? {
            id: r.orders.id,
            status: r.orders.status,
            amountClp: r.orders.amount_clp,
            refundedAmountClp: r.orders.refunded_amount_clp ?? 0,
            createdAt: r.orders.created_at,
            mpPaymentId: r.orders.mp_payment_id,
            customerEmail: r.orders.customer_email,
            feeAmount: r.orders.payment_snapshot?.fee_amount ?? null,
          }
        : null,
    }));
  }

  /** Líneas de esas órdenes (para attach de add-ons). */
  async analyticsLines(orderIds: string[]): Promise<AnalyticsLineRow[]> {
    if (orderIds.length === 0) return [];
    const { data } = await this.db
      .from("order_lines")
      .select("order_id, line_type, addon_key, description, subtotal_clp")
      .in("order_id", orderIds);
    return (data ?? []).map((l) => ({
      orderId: l.order_id,
      lineType: l.line_type,
      addonKey: l.addon_key,
      description: l.description,
      subtotalClp: l.subtotal_clp,
    }));
  }

  /** Horario semanal + excepciones del recurso principal (denominador de ocupación). */
  async analyticsSchedule(): Promise<{ openingHours: OpeningHourRow[]; exceptions: ExceptionRow[] }> {
    const resource = await this.defaultResource();
    if (!resource) return { openingHours: [], exceptions: [] };
    const [hours, exceptions] = await Promise.all([
      this.db.from("opening_hours").select("weekday, open_minute, close_minute").eq("resource_id", resource.id),
      this.db
        .from("schedule_exceptions")
        .select("date, closed, open_minute, close_minute")
        .eq("resource_id", resource.id),
    ]);
    return {
      openingHours: (hours.data ?? []).map((h) => ({
        weekday: h.weekday,
        openMinute: h.open_minute,
        closeMinute: h.close_minute,
      })),
      exceptions: (exceptions.data ?? []).map((e) => ({
        date: e.date,
        closed: e.closed,
        openMinute: e.open_minute,
        closeMinute: e.close_minute,
      })),
    };
  }

  /** Emails (lowercase) con alguna orden pagada creada ANTES de `beforeUtc` (recurrentes). */
  async priorCustomerEmails(beforeUtc: string): Promise<Set<string>> {
    const { data } = await this.db
      .from("orders")
      .select("customer_email")
      .in("status", ["paid", "refunded", "fulfilled"])
      .lt("created_at", beforeUtc)
      .not("customer_email", "is", null)
      .limit(2000);
    return new Set((data ?? []).map((o) => (o.customer_email as string).trim().toLowerCase()));
  }

  /** Métricas y pendientes del panel "Hoy". */
  async dashboard(): Promise<DashboardData> {
    const now = DateTime.now().setZone(TZ);
    const todayStart = now.startOf("day");
    const todayEnd = todayStart.plus({ days: 1 });
    const weekStart = now.startOf("week");
    const weekEnd = weekStart.plus({ weeks: 1 });

    const [weekBookings, upcoming, boletas, pendingPay] = await Promise.all([
      this.bookingsBetween(weekStart.toUTC().toISO()!, weekEnd.toUTC().toISO()!),
      this.upcomingBookings(40),
      this.pendingBoletas(),
      this.db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
    ]);

    const sessions = weekBookings.filter((b) => b.kind !== "block");
    const isToday = (b: AdminBooking) => {
      const s = DateTime.fromISO(b.startsAt).setZone(TZ);
      return s >= todayStart && s < todayEnd;
    };
    const nonBlock = upcoming.filter((b) => b.kind !== "block");
    const today = nonBlock.filter(isToday);

    const weekRevenue = sessions.reduce((s, b) => s + (b.orderStatus === "paid" ? (b.amount ?? 0) : 0), 0);

    return {
      todaySessions: today.length,
      weekRevenue,
      weekOccupancyPct: await this.weekOccupancy(weekStart, sessions),
      pendingBoletas: boletas.length,
      pendingPayments: pendingPay.count ?? 0,
      accessToSend: nonBlock.filter((b) => b.status === "confirmed" && !b.accessCode).length,
      today,
      upcoming: nonBlock.filter((b) => !isToday(b)).slice(0, 12),
      boletas,
    };
  }

  /** Conteo liviano de pendientes (boletas + pagos) para el badge del sidebar. */
  async porHacerCount(): Promise<number> {
    const [b, p] = await Promise.all([
      this.db.from("tax_documents").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
      this.db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
    ]);
    return (b.count ?? 0) + (p.count ?? 0);
  }

  /** Ocupación de la semana: horas reservadas ÷ horas de apertura (0–100). */
  private async weekOccupancy(weekStart: DateTime, sessions: AdminBooking[]): Promise<number> {
    const { data: r } = await this.db.from("resources").select("id").eq("active", true).limit(1).single();
    if (!r) return 0;
    const { data: oh } = await this.db
      .from("opening_hours")
      .select("weekday, open_minute, close_minute")
      .eq("resource_id", r.id);
    let openMin = 0;
    for (let i = 0; i < 7; i++) {
      const wd = weekStart.plus({ days: i }).weekday % 7; // Luxon 1=Lun..7=Dom → 0=Dom..6=Sáb
      const row = (oh ?? []).find((x) => x.weekday === wd);
      if (row) openMin += row.close_minute - row.open_minute;
    }
    if (openMin === 0) return 0;
    const bookedMin = sessions.reduce(
      (s, b) => s + DateTime.fromISO(b.endsAt).diff(DateTime.fromISO(b.startsAt), "minutes").minutes,
      0,
    );
    return Math.min(100, Math.round((bookedMin / openMin) * 100));
  }

  async getBooking(id: string): Promise<AdminBookingDetail | null> {
    // Select propio (más rico que el compartido) para no cargar campos MP en los listados.
    const DETAIL_SELECT =
      "id, starts_at, ends_at, status, kind, customer_name, customer_email, customer_phone, access_code, access_sent_at, created_at, cancelled_at, notes, order_id, orders(amount_clp, status, paid_at, refunded_at, refunded_amount_clp, points_redeemed_clp, mp_payment_id, mp_preference_id, mp_refund_id, payment_snapshot)";
    const { data } = await this.db.from("reservations").select(DETAIL_SELECT).eq("id", id).single();
    if (!data) return null;
    const row = data as unknown as ResRow & {
      orders:
        | (NonNullable<ResRow["orders"]> & {
            points_redeemed_clp: number | null;
            mp_payment_id: string | null;
            mp_preference_id: string | null;
            mp_refund_id: string | null;
            payment_snapshot: PaymentSnapshot | null;
          })
        | null;
    };
    const base = map(row);

    let lines: { description: string; subtotal: number }[] = [];
    let addonKeys: string[] = [];
    let taxDocs: AdminBookingDetail["taxDocs"] = [];
    if (base.orderId) {
      const { data: l } = await this.db
        .from("order_lines")
        .select("description, subtotal_clp, addon_key")
        .eq("order_id", base.orderId);
      lines = (l ?? []).map((x) => ({ description: x.description, subtotal: x.subtotal_clp }));
      addonKeys = (l ?? []).map((x) => x.addon_key).filter((k): k is string => !!k);
      // Todos los documentos tributarios (boletas + NC): un pedido reembolsado
      // parcialmente puede tener boleta original + NC + boleta del saldo.
      const { data: docs } = await this.db
        .from("tax_documents")
        .select("id, kind, status, folio, total, created_at")
        .eq("order_id", base.orderId)
        .order("created_at", { ascending: true });
      taxDocs = (docs ?? []).map((d) => ({
        id: d.id,
        kind: d.kind,
        status: d.status,
        folio: d.folio,
        total: d.total,
      }));
    }
    // Eventos de reagendamiento (keyed por reserva; los bloqueos no tienen).
    const { data: moves } = await this.db
      .from("reschedules")
      .select("kind, status, old_starts_at, new_starts_at, delta_clp, created_at, applied_at")
      .eq("reservation_id", id)
      .order("created_at", { ascending: true });
    const reschedules = (moves ?? []).map((m) => ({
      kind: m.kind,
      status: m.status,
      oldStartsAt: m.old_starts_at,
      newStartsAt: m.new_starts_at,
      deltaClp: m.delta_clp,
      createdAt: m.created_at,
      appliedAt: m.applied_at,
    }));

    return {
      ...base,
      lines,
      addonKeys,
      pointsRedeemedClp: row.orders?.points_redeemed_clp ?? 0,
      taxDocs,
      reschedules,
      mpPaymentId: row.orders?.mp_payment_id ?? null,
      mpPreferenceId: row.orders?.mp_preference_id ?? null,
      mpRefundId: row.orders?.mp_refund_id ?? null,
      paymentSnapshot: row.orders?.payment_snapshot ?? null,
    };
  }

  async pendingBoletas(): Promise<PendingBoleta[]> {
    const { data } = await this.db
      .from("tax_documents")
      .select("id, order_id, kind, neto, iva, total, created_at")
      .eq("status", "pendiente")
      .order("created_at", { ascending: true });
    return (data ?? []).map((d) => ({
      id: d.id,
      orderId: d.order_id,
      kind: d.kind,
      neto: d.neto,
      iva: d.iva,
      total: d.total,
      createdAt: d.created_at,
    }));
  }

  async upcomingBlocks(limit = 50): Promise<AdminBooking[]> {
    const { data } = await this.db
      .from("reservations")
      .select(SELECT)
      .eq("kind", "block")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);
    return ((data as unknown as ResRow[]) ?? []).map(map);
  }

  async defaultResource(): Promise<{ id: string; timezone: string } | null> {
    const { data: r } = await this.db
      .from("resources")
      .select("id, location_id")
      .eq("active", true)
      .limit(1)
      .single();
    if (!r) return null;
    const { data: loc } = await this.db
      .from("locations")
      .select("timezone")
      .eq("id", r.location_id)
      .single();
    return { id: r.id, timezone: loc?.timezone ?? "America/Santiago" };
  }

  // ── escrituras
  /**
   * Orden asociada a una reserva, con lo necesario para decidir el reembolso:
   * estado, pago MP, montos (boleta viva = amount − refunded) y inicio de sesión
   * (para la política de cancelación).
   */
  async orderForReservation(reservationId: string): Promise<{
    orderId: string;
    status: string;
    mpPaymentId: string | null;
    amountClp: number;
    refundedAmountClp: number;
    pointsRedeemedClp: number;
    startsAt: string | null;
  } | null> {
    const { data: r } = await this.db
      .from("reservations")
      .select("order_id, starts_at")
      .eq("id", reservationId)
      .single();
    if (!r?.order_id) return null;
    const { data: o } = await this.db
      .from("orders")
      .select("status, mp_payment_id, amount_clp, refunded_amount_clp, points_redeemed_clp")
      .eq("id", r.order_id)
      .single();
    if (!o) return null;
    return {
      orderId: r.order_id,
      status: o.status,
      mpPaymentId: o.mp_payment_id,
      amountClp: o.amount_clp,
      refundedAmountClp: o.refunded_amount_clp ?? 0,
      pointsRedeemedClp: o.points_redeemed_clp ?? 0,
      startsAt: r.starts_at,
    };
  }

  /**
   * Cancela una reserva SIN reembolso (la orden pagada queda 'paid'; la no pagada
   * → 'cancelled'). Los reembolsos van por `mark_refunded` (RefundService).
   */
  async cancelBooking(reservationId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_booking", { p_reservation: reservationId });
    if (error) throw new Error(error.message);
  }

  /** Orden 100% puntos: cancela reserva, marca 'refunded' y repone puntos (sin NC). */
  async refundPointsOrder(orderId: string, restorePoints: number): Promise<void> {
    const { error } = await this.db.rpc("refund_points_order", {
      p_order: orderId,
      p_restore: restorePoints,
    });
    if (error) throw new Error(error.message);
  }

  /** Devuelve el estado del RPC: 'confirmed' (hold confirmado) o 'paid_no_hold'. */
  async confirmOffline(orderId: string, method: string): Promise<string> {
    const { data, error } = await this.db.rpc("confirm_payment", {
      p_order: orderId,
      p_payment_id: `offline:${method}`,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** Libera el hold y cancela una orden no pagada (limpieza si confirmar el pago falla). */
  async cancelUnpaidOrder(orderId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_unpaid_order", { p_order: orderId });
    if (error) throw new Error(error.message);
  }

  /**
   * Notas internas de la reserva de una orden (reserva manual pagada); devuelve
   * el id de la reserva. Con notes null solo resuelve el id, sin escribir.
   */
  async setNotesForOrder(orderId: string, notes: string | null): Promise<string | null> {
    if (notes) {
      const { data, error } = await this.db
        .from("reservations")
        .update({ notes })
        .eq("order_id", orderId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data?.id ?? null;
    }
    const { data } = await this.db.from("reservations").select("id").eq("order_id", orderId).single();
    return data?.id ?? null;
  }

  async recordBoleta(docId: string, folio: string, pdfUrl: string | null): Promise<void> {
    const { error } = await this.db
      .from("tax_documents")
      .update({ status: "emitida", folio, pdf_url: pdfUrl, emitted_at: new Date().toISOString() })
      .eq("id", docId);
    if (error) throw new Error(error.message);
  }

  async markAccess(reservationId: string, code: string): Promise<void> {
    const { error } = await this.db
      .from("reservations")
      .update({ access_code: code, access_sent_at: new Date().toISOString() })
      .eq("id", reservationId);
    if (error) throw new Error(error.message);
  }

  async createBlock(resourceId: string, startsAt: string, endsAt: string): Promise<void> {
    const { error } = await this.db.from("reservations").insert({
      resource_id: resourceId,
      kind: "block",
      status: "confirmed",
      starts_at: startsAt,
      ends_at: endsAt,
    });
    if (error) throw new Error(error.code === "23P01" ? "overlap" : error.message);
  }

  /** Reserva de cortesía: confirmada, sin pedido ni boleta (comp gratis). Devuelve el id. */
  async createCourtesyBooking(
    resourceId: string,
    startsAt: string,
    endsAt: string,
    customer: { name?: string; email?: string; phone?: string },
    notes?: string,
  ): Promise<string> {
    const { data, error } = await this.db
      .from("reservations")
      .insert({
        resource_id: resourceId,
        kind: "booking",
        status: "confirmed",
        starts_at: startsAt,
        ends_at: endsAt,
        customer_name: customer.name ?? null,
        customer_email: customer.email ?? null,
        customer_phone: customer.phone ?? null,
        notes: notes ? `Cortesía — ${notes}` : "Cortesía",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23P01" ? "slot_taken" : error.message);
    return data.id;
  }

  async deleteBlock(reservationId: string): Promise<void> {
    const { error } = await this.db
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("kind", "block");
    if (error) throw new Error(error.message);
  }
}
