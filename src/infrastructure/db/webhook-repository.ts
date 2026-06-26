import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import type { Database, Json } from "./database.types";

export class SupabaseWebhookRepository implements PaymentNotificationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async recordEvent(eventId: string, topic: string, payload: unknown): Promise<boolean> {
    const { error } = await this.db
      .from("webhook_events")
      .insert({ event_id: eventId, topic, payload: payload as Json });
    if (error) {
      if (error.code === "23505") return false; // unique_violation → duplicado
      throw new Error(error.message);
    }
    return true;
  }

  async confirmPaid(orderId: string, paymentId: string): Promise<void> {
    const { error } = await this.db.rpc("confirm_payment", {
      p_order: orderId,
      p_payment_id: paymentId,
    });
    if (error) throw new Error(error.message);
  }

  async cancelUnpaid(orderId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_unpaid_order", { p_order: orderId });
    if (error) throw new Error(error.message);
  }
}
