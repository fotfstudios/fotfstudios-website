import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRepository, OrderEmailData } from "@/src/application/ports/notifications";
import type { Database } from "./database.types";

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getOrderForEmail(orderId: string): Promise<OrderEmailData | null> {
    const { data: o } = await this.db
      .from("orders")
      .select("id, customer_email, customer_name, amount_clp, currency, notified_at")
      .eq("id", orderId)
      .single();
    if (!o) return null;

    const { data: r } = await this.db
      .from("reservations")
      .select("starts_at, ends_at")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    const { data: lines } = await this.db
      .from("order_lines")
      .select("description, subtotal_clp")
      .eq("order_id", orderId);

    return {
      id: o.id,
      email: o.customer_email,
      name: o.customer_name,
      amount: o.amount_clp,
      currency: o.currency,
      notifiedAt: o.notified_at,
      startsAt: r?.starts_at ?? null,
      endsAt: r?.ends_at ?? null,
      lines: (lines ?? []).map((l) => ({ description: l.description, subtotal: l.subtotal_clp })),
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

  async markNotified(orderId: string): Promise<void> {
    const { error } = await this.db
      .from("orders")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) throw new Error(error.message);
  }
}
