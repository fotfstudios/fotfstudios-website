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
      // El generador tipa p_ttl como `string | undefined` (no refleja que la función SQL
      // acepta NULL explícito → hold firme); el cast documenta el gap, no cambia runtime.
      p_ttl: (p.holdTtlMinutes === null ? null : `${p.holdTtlMinutes ?? 10} minutes`) as string | undefined,
      p_customer_id: p.customerId,
      p_points: p.pointsRedeemed ?? 0,
      p_terms_version: p.termsVersion,
      p_terms_source: p.termsSource,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
}
