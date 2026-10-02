import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentReminderRepository } from "@/src/application/reminders/payment-reminder-service";
import type { Database } from "./database.types";

export class SupabasePaymentReminderRepository implements PaymentReminderRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /** payment_reminders_due: pre-filtro (mismo universo que expire_abandoned_manual_holds_ids). */
  async due() {
    const { data, error } = await this.db.rpc("payment_reminders_due");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      orderId: r.order_id,
      clockStart: r.clock_start,
      startsAt: r.starts_at,
      customerEmail: r.customer_email ?? null,
    }));
  }

  /** Reclama solo si aún no estaba marcado: dos corridas del cron no mandan dos veces. */
  async markSent(orderId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("orders")
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("payment_reminder_sent_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseSent(orderId: string): Promise<void> {
    const { error } = await this.db.from("orders").update({ payment_reminder_sent_at: null }).eq("id", orderId);
    if (error) throw new Error(error.message);
  }
}
