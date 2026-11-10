import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutRepository, CreateCheckoutParams } from "@/src/application/ports/checkout";
import type { OrderAttribution } from "@/src/domain/booking/order-attribution";
import type { Json } from "./database.types";
import type { Database } from "./database.types";
import { retryOnDeadlock } from "./rpc-retry";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

/** OrderAttribution (camelCase) → columnas de `orders`, solo los campos con valor. */
function attributionRow(a: OrderAttribution): Partial<OrderUpdate> {
  const row: Partial<OrderUpdate> = {};
  if (a.utmSource !== null) row.utm_source = a.utmSource;
  if (a.utmMedium !== null) row.utm_medium = a.utmMedium;
  if (a.utmCampaign !== null) row.utm_campaign = a.utmCampaign;
  if (a.utmContent !== null) row.utm_content = a.utmContent;
  if (a.utmTerm !== null) row.utm_term = a.utmTerm;
  if (a.referrerHost !== null) row.referrer_host = a.referrerHost;
  if (a.landingPath !== null) row.landing_path = a.landingPath;
  if (a.gclid !== null) row.gclid = a.gclid;
  if (a.gbraid !== null) row.gbraid = a.gbraid;
  if (a.wbraid !== null) row.wbraid = a.wbraid;
  if (a.fbclid !== null) row.fbclid = a.fbclid;
  if (a.fbc !== null) row.fbc = a.fbc;
  if (a.fbp !== null) row.fbp = a.fbp;
  if (a.gaClientId !== null) row.ga_client_id = a.gaClientId;
  if (a.gaSessionId !== null) row.ga_session_id = a.gaSessionId;
  return row;
}

/** Llama a la función transaccional create_checkout (hold + pedido + líneas). */
export class SupabaseCheckoutRepository implements CheckoutRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createCheckout(p: CreateCheckoutParams): Promise<string> {
    // Reintento único ante 40P01: dos checkouts del MISMO slot en el mismo instante pueden
    // deadlockear al verificar reservations_no_overlap (ver rpc-retry.ts). La función es una
    // sentencia, así que abortar y volver a llamar no deja nada a medias.
    const { data, error } = await retryOnDeadlock(() =>
      this.db.rpc("create_checkout", {
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
      // Solo cuando es una prueba: el checkout público nunca lo manda (default 'booking').
      ...(p.orderKind ? { p_order_kind: p.orderKind } : {}),
    }),
    );
    if (error) throw new Error(error.message);
    return data as string;
  }

  async saveAttribution(orderId: string, attribution: OrderAttribution): Promise<void> {
    const row = attributionRow(attribution);
    if (Object.keys(row).length === 0) return; // reserva directa: nada que escribir
    const { error } = await this.db.from("orders").update(row).eq("id", orderId);
    if (error) throw new Error(error.message);
  }
}
