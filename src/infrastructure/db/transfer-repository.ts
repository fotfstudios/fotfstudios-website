import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Resultado de request_transfer (migración 20261016120000). */
export type RequestTransferResult = "ok" | "disabled" | "not_found" | "not_pending" | "no_hold" | "too_late";
/** Resultado de declare_transfer. */
export type DeclareTransferResult = "ok" | "already" | "not_found" | "not_transfer" | "not_pending" | "expired";

/**
 * Transferencia como respaldo del checkout: el interruptor del admin (checkout_settings) y
 * las dos transiciones del cupo. Las reglas (plazos, anticipación) viven en las RPC.
 */
export class SupabaseTransferRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /** ¿Está prendida la transferencia en el checkout? Ante un error de lectura, apagada. */
  async isEnabled(): Promise<boolean> {
    const { data, error } = await this.db.from("checkout_settings").select("transfer_enabled").eq("id", true).maybeSingle();
    if (error) {
      console.error("[transfer:settings]", error.message);
      return false;
    }
    return data?.transfer_enabled ?? false;
  }

  async setEnabled(on: boolean, userId: string | null): Promise<void> {
    const { error } = await this.db
      .from("checkout_settings")
      .update({ transfer_enabled: on, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", true);
    if (error) throw new Error(error.message);
  }

  async request(orderId: string): Promise<RequestTransferResult> {
    const { data, error } = await this.db.rpc("request_transfer", { p_order: orderId });
    if (error) throw new Error(error.message);
    return data as RequestTransferResult;
  }

  async declare(orderId: string): Promise<DeclareTransferResult> {
    const { data, error } = await this.db.rpc("declare_transfer", { p_order: orderId });
    if (error) throw new Error(error.message);
    return data as DeclareTransferResult;
  }
}
