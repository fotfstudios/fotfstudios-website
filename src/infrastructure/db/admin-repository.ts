import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
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
}

export interface AdminBookingDetail extends AdminBooking {
  lines: { description: string; subtotal: number }[];
  boleta: { id: string; status: string; folio: string | null } | null;
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
  order_id: string | null;
  orders: { amount_clp: number; status: string; paid_at: string | null } | null;
};

const SELECT =
  "id, starts_at, ends_at, status, kind, customer_name, customer_email, customer_phone, access_code, access_sent_at, created_at, order_id, orders(amount_clp, status, paid_at)";

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

  async recentBookings(limit = 80): Promise<AdminBooking[]> {
    const { data } = await this.db
      .from("reservations")
      .select(SELECT)
      .order("starts_at", { ascending: false })
      .limit(limit);
    return ((data as unknown as ResRow[]) ?? []).map(map);
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
    const { data } = await this.db.from("reservations").select(SELECT).eq("id", id).single();
    if (!data) return null;
    const base = map(data as unknown as ResRow);

    let lines: { description: string; subtotal: number }[] = [];
    let boleta: AdminBookingDetail["boleta"] = null;
    if (base.orderId) {
      const { data: l } = await this.db
        .from("order_lines")
        .select("description, subtotal_clp")
        .eq("order_id", base.orderId);
      lines = (l ?? []).map((x) => ({ description: x.description, subtotal: x.subtotal_clp }));
      const { data: b } = await this.db
        .from("tax_documents")
        .select("id, status, folio")
        .eq("order_id", base.orderId)
        .eq("kind", "boleta")
        .maybeSingle();
      boleta = b ? { id: b.id, status: b.status, folio: b.folio } : null;
    }
    return { ...base, lines, boleta };
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
  async cancelBooking(reservationId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_booking", { p_reservation: reservationId });
    if (error) throw new Error(error.message);
  }

  async confirmOffline(orderId: string, method: string): Promise<void> {
    const { error } = await this.db.rpc("confirm_payment", {
      p_order: orderId,
      p_payment_id: `offline:${method}`,
    });
    if (error) throw new Error(error.message);
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

  /** Reserva de cortesía: confirmada, sin pedido ni boleta (comp gratis). */
  async createCourtesyBooking(
    resourceId: string,
    startsAt: string,
    endsAt: string,
    customer: { name?: string; email?: string; phone?: string },
  ): Promise<void> {
    const { error } = await this.db.from("reservations").insert({
      resource_id: resourceId,
      kind: "booking",
      status: "confirmed",
      starts_at: startsAt,
      ends_at: endsAt,
      customer_name: customer.name ?? null,
      customer_email: customer.email ?? null,
      customer_phone: customer.phone ?? null,
      notes: "Cortesía",
    });
    if (error) throw new Error(error.code === "23P01" ? "slot_taken" : error.message);
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
