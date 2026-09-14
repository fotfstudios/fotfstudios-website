import type { SupabaseClient } from "@supabase/supabase-js";
import type { FirstBookingPromoReader } from "@/src/application/ports/promos";
import type { Database } from "./database.types";

/**
 * Elegibilidad de la promo de primera reserva. RPC y no consulta PostgREST a
 * propósito: la función compara `lower(customer_email)` (filas históricas con
 * mayúsculas) con índice de expresión, y `ilike` trataría `_`/`%` del correo
 * como comodines. Solo service_role puede ejecutarla.
 */
export class SupabasePromoRepository implements FirstBookingPromoReader {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async used(email: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("first_booking_promo_used", { p_email: email });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
