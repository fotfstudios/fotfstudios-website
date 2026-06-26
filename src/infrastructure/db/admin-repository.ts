import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

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
}

export interface AdminBookingDetail extends AdminBooking {
  lines: { description: string; subtotal: number }[];
  boleta: { id: string; status: string; folio: string | null } | null;
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
  order_id: string | null;
  orders: { amount_clp: number; status: string } | null;
};

const SELECT =
  "id, starts_at, ends_at, status, kind, customer_name, customer_email, customer_phone, access_code, access_sent_at, order_id, orders(amount_clp, status)";

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

  async deleteBlock(reservationId: string): Promise<void> {
    const { error } = await this.db
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("kind", "block");
    if (error) throw new Error(error.message);
  }
}
