import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderConfirmation,
  OrderConfirmationReader,
  OrderForPayment,
  OrderPaymentRepository,
  RecordPreferenceParams,
} from "@/src/application/ports/orders";
import type { Database } from "./database.types";

export class SupabaseOrderRepository implements OrderPaymentRepository, OrderConfirmationReader {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Vista de confirmación para /reserva/estado. Espeja getOrderForEmail
   * (notification-repository) + nombre de la sala vía select anidado por FK.
   * SIN email/teléfono: la página es alcanzable por cualquiera con el link.
   */
  async getOrderConfirmation(orderId: string): Promise<OrderConfirmation | null> {
    const { data: o } = await this.db
      .from("orders")
      .select("id, status, customer_name, amount_clp, currency, mp_preference_id")
      .eq("id", orderId)
      .single();
    if (!o) return null;

    const { data: r } = await this.db
      .from("reservations")
      .select("starts_at, ends_at, status, resources(name)")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    const { data: lines } = await this.db
      .from("order_lines")
      .select("description, subtotal_clp")
      .eq("order_id", orderId);

    return {
      orderId: o.id,
      orderStatus: o.status,
      customerName: o.customer_name,
      startsAt: r?.starts_at ?? null,
      endsAt: r?.ends_at ?? null,
      resourceName: r?.resources?.name ?? null,
      reservationStatus: r?.status ?? null,
      preferenceId: o.mp_preference_id,
      lines: (lines ?? []).map((l) => ({ description: l.description, subtotal: l.subtotal_clp })),
      total: o.amount_clp,
      currency: o.currency,
    };
  }

  async getOrderForPayment(orderId: string): Promise<OrderForPayment | null> {
    const { data } = await this.db
      .from("orders")
      .select("id, amount_clp, currency, customer_email, customer_name")
      .eq("id", orderId)
      .single();
    if (!data) return null;
    return {
      id: data.id,
      amount: data.amount_clp,
      currency: data.currency,
      email: data.customer_email ?? undefined,
      name: data.customer_name ?? undefined,
    };
  }

  async pendingOrderIds(opts: {
    olderThanMinutes: number;
    withinHours: number;
    limit?: number;
  }): Promise<string[]> {
    const now = Date.now();
    const before = new Date(now - opts.olderThanMinutes * 60_000).toISOString();
    const after = new Date(now - opts.withinHours * 3_600_000).toISOString();
    const { data } = await this.db
      .from("orders")
      .select("id")
      .eq("status", "pending_payment")
      .lt("created_at", before)
      .gt("created_at", after)
      .limit(opts.limit ?? 100);
    return (data ?? []).map((o) => o.id);
  }

  async recordPreference(p: RecordPreferenceParams): Promise<void> {
    const { error: e1 } = await this.db.from("payment_intents").insert({
      order_id: p.orderId,
      provider: p.provider,
      preference_id: p.preferenceId,
      amount_clp: p.amount,
      currency: p.currency,
      status: "created",
    });
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await this.db
      .from("orders")
      .update({ mp_preference_id: p.preferenceId })
      .eq("id", p.orderId);
    if (e2) throw new Error(e2.message);
  }
}
