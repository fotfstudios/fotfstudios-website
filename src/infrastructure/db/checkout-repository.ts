import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutRepository, CreateCheckoutParams } from "@/src/application/ports/checkout";
import type { Json } from "./database.types";
import type { Database } from "./database.types";

/** Llama a la función transaccional create_checkout (hold + pedido + líneas). */
export class SupabaseCheckoutRepository implements CheckoutRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createCheckout(p: CreateCheckoutParams): Promise<string> {
    const { data, error } = await this.db.rpc("create_checkout", {
      p_resource: p.resourceId,
      p_starts: p.startsAt,
      p_ends: p.endsAt,
      p_amount: p.amount,
      p_net: p.net,
      p_tax: p.tax,
      p_currency: p.currency,
      p_customer: p.customer as unknown as Json,
      p_snapshot: p.snapshot as unknown as Json,
      p_lines: p.lines as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
