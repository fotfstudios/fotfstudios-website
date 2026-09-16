import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import type { GuideLeadRow, GuiaLeadsListQuery } from "@/src/domain/admin/guia-leads-list";
import type { GuideLeadInput, GuideLeadSource } from "@/src/domain/guide/lead";
import type { GuideLeadRepository, GuideLeadRequest } from "@/src/application/ports/guide";
import type { Database } from "./database.types";

const ROW_COLS = "id, email, source, request_count, created_at, last_requested_at, last_downloaded_at";

type Raw = {
  id: string;
  email: string;
  source: string;
  request_count: number;
  created_at: string;
  last_requested_at: string;
  last_downloaded_at: string | null;
};

const toRow = (r: Raw): GuideLeadRow => ({
  id: r.id,
  email: r.email,
  source: r.source as GuideLeadSource,
  requestCount: r.request_count,
  createdAt: r.created_at,
  lastRequestedAt: r.last_requested_at,
  lastDownloadedAt: r.last_downloaded_at,
});

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

  async list(query: GuiaLeadsListQuery): Promise<{ rows: GuideLeadRow[]; total: number; grandTotal: number }> {
    const from = (query.page - 1) * query.perPage;
    // La aguja pasa por escapeIlike: `_` y `%` se escapan; `*` (que PostgREST reescribe a
    // `%` antes de llegar a Postgres) se reemplaza por espacio. Vacía tras sanear → sin filtro.
    const needle = query.q ? escapeIlike(query.q.toLowerCase()) : "";
    const filtered = <T extends { ilike(col: string, v: string): T }>(b: T): T =>
      needle ? b.ilike("email", `%${needle}%`) : b;

    // La página de datos NO pide count: con count, un offset fuera de rango devuelve 416
    // en vez de []. Los conteos van aparte (mismo patrón que clientes).
    const [page, matching, all] = await Promise.all([
      filtered(this.db.from("guide_leads").select(ROW_COLS))
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + query.perPage - 1),
      filtered(this.db.from("guide_leads").select("id", { count: "exact", head: true })),
      this.db.from("guide_leads").select("id", { count: "exact", head: true }),
    ]);
    if (page.error) throw new Error(page.error.message);
    if (matching.error) throw new Error(matching.error.message);
    if (all.error) throw new Error(all.error.message);
    return { rows: (page.data ?? []).map(toRow), total: matching.count ?? 0, grandTotal: all.count ?? 0 };
  }

  async exportAll(limit: number): Promise<GuideLeadRow[]> {
    const { data, error } = await this.db
      .from("guide_leads")
      .select(ROW_COLS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRow);
  }
}
