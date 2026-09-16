import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuideLeadInput } from "@/src/domain/guide/lead";
import type { GuideLeadRepository, GuideLeadRequest } from "@/src/application/ports/guide";
import type { Database } from "./database.types";

/** Leads de /guia-dj sobre `guide_leads` (migración 20260915130000_guia_dj). */
export class SupabaseGuideLeadRepository implements GuideLeadRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /** Alta o re-pedido en una ida (RPC idempotente por email). `isNew` = primer pedido. */
  async request(input: GuideLeadInput): Promise<GuideLeadRequest> {
    const { data, error } = await this.db
      .rpc("guide_lead_request", { p_email: input.email, p_source: input.source })
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, token: data.download_token, isNew: data.request_count === 1 };
  }

  /** Marca la descarga; el select dice si el token existe. Nunca de un solo uso. */
  async touchDownload(token: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("guide_leads")
      .update({ last_downloaded_at: new Date().toISOString() })
      .eq("download_token", token)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }
}
