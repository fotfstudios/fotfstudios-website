import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderForPayment,
  OrderPaymentRepository,
  RecordPreferenceParams,
} from "@/src/application/ports/orders";
import type { Database } from "./database.types";

export class SupabaseOrderRepository implements OrderPaymentRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getOrderForPayment(orderId: string): Promise<OrderForPayment | null> {
    const { data } = await this.db
      .from("orders")
      .select("id, amount_clp, currency, customer_email")
      .eq("id", orderId)
      .single();
    if (!data) return null;
    return {
      id: data.id,
      amount: data.amount_clp,
      currency: data.currency,
      email: data.customer_email ?? undefined,
    };
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
