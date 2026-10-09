import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRepository, OrderEmailData, ReservationContact } from "@/src/application/ports/notifications";
import type { Database } from "./database.types";

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getOrderForEmail(orderId: string): Promise<OrderEmailData | null> {
    const { data: o } = await this.db
      .from("orders")
      // La ficha (customers) trae el consentimiento de WhatsApp y su celular vigente.
      .select(
        "id, kind, customer_email, customer_name, customer_phone, amount_clp, currency, notified_at, payment_method, customers(phone, whatsapp_opt_in)",
      )
      .eq("id", orderId)
      .single();
    if (!o) return null;

    const { data: r } = await this.db
      .from("reservations")
      .select("id, starts_at, ends_at")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    const { data: lines } = await this.db
      .from("order_lines")
      .select("description, subtotal_clp")
      .eq("order_id", orderId);

    return {
      id: o.id,
      kind: o.kind,
      email: o.customer_email,
      name: o.customer_name,
      amount: o.amount_clp,
      currency: o.currency,
      notifiedAt: o.notified_at,
      paymentMethod: o.payment_method,
      startsAt: r?.starts_at ?? null,
      endsAt: r?.ends_at ?? null,
      lines: (lines ?? []).map((l) => ({ description: l.description, subtotal: l.subtotal_clp })),
      reservationId: r?.id ?? null,
      phone: o.customers?.phone ?? o.customer_phone ?? null,
      whatsappOptIn: o.customers?.whatsapp_opt_in ?? false,
    };
  }

  async getReservationContact(reservationId: string): Promise<ReservationContact | null> {
    const { data: r } = await this.db
      .from("reservations")
      .select("id, starts_at, ends_at, customer_name, customer_email, customer_phone, customers(phone, whatsapp_opt_in)")
      .eq("id", reservationId)
      .maybeSingle();
    if (!r) return null;
    return {
      reservationId: r.id,
      name: r.customer_name,
      email: r.customer_email,
      // Mismo criterio que getOrderForEmail: el celular de la ficha, o el de la reserva.
      phone: r.customers?.phone ?? r.customer_phone ?? null,
      whatsappOptIn: r.customers?.whatsapp_opt_in ?? false,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
    };
  }

  async pendingPaidOrderIds(limit = 50): Promise<string[]> {
    const { data } = await this.db
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .is("notified_at", null)
      .limit(limit);
    return (data ?? []).map((o) => o.id);
  }

  async markNotified(orderId: string): Promise<boolean> {
    // `.is("notified_at", null)` + `select` = UPDATE … WHERE notified_at IS NULL
    // RETURNING id: un solo statement, así dos corridas no pueden reclamar la misma.
    const { data, error } = await this.db
      .from("orders")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("notified_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseNotified(orderId: string): Promise<void> {
    const { error } = await this.db.from("orders").update({ notified_at: null }).eq("id", orderId);
    if (error) throw new Error(error.message);
  }
}
