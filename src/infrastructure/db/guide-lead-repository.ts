import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import type { GuideLeadRow, GuiaLeadsListQuery } from "@/src/domain/admin/guia-leads-list";
import type { GuideLeadInput } from "@/src/domain/guide/lead";
import type { GuideLeadRepository, GuideLeadRequest } from "@/src/application/ports/guide";
import type { Database } from "./database.types";

// Una sola cadena literal a propósito: si se parte en una concatenación, el tipado de
// Supabase deja de inferir las columnas y las filas salen como GenericStringError.
const ROW_COLS =
  "id, email, guide_slug, source, request_count, created_at, last_requested_at, last_downloaded_at, consent_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host";

type Raw = {
  id: string;
  email: string;
  guide_slug: string;
  source: string;
  request_count: number;
  created_at: string;
  last_requested_at: string;
  last_downloaded_at: string | null;
  consent_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_host: string | null;
};

const toRow = (r: Raw): GuideLeadRow => ({
  id: r.id,
  email: r.email,
  guideSlug: r.guide_slug,
  source: r.source,
  requestCount: r.request_count,
  createdAt: r.created_at,
  lastRequestedAt: r.last_requested_at,
  lastDownloadedAt: r.last_downloaded_at,
  consentAt: r.consent_at,
  utmSource: r.utm_source,
  utmMedium: r.utm_medium,
  utmCampaign: r.utm_campaign,
  utmContent: r.utm_content,
  utmTerm: r.utm_term,
  referrerHost: r.referrer_host,
});

/**
 * Leads de las guías sobre `guide_leads`
 * (migraciones 20260915130000_guia_dj y 20260923190000_guias_multi).
 */
export class SupabaseGuideLeadRepository implements GuideLeadRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Alta o re-pedido en una ida (RPC idempotente por (guía, email)). `isNew` = primer
   * pedido de ESA guía: la misma persona puede ser nueva en una y repetida en otra.
   */
  async request(input: GuideLeadInput): Promise<GuideLeadRequest> {
    const { data, error } = await this.db
      .rpc("guide_lead_capture", {
        p_email: input.email,
        p_source: input.source,
        p_guide: input.guide,
        // El dominio usa null para "no vino"; el RPC tiene DEFAULT null, así que sus
        // parámetros opcionales se omiten con undefined. La traducción va acá, en el
        // adaptador, que es donde corresponde.
        p_utm_source: input.utm.source ?? undefined,
        p_utm_medium: input.utm.medium ?? undefined,
        p_utm_campaign: input.utm.campaign ?? undefined,
        p_utm_content: input.utm.content ?? undefined,
        p_utm_term: input.utm.term ?? undefined,
        p_referrer_host: input.referrerHost ?? undefined,
      })
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, token: data.download_token, isNew: data.request_count === 1 };
  }

  /**
   * Marca la descarga y devuelve la guía del token. Un solo round trip: el PDF a firmar
   * depende de la guía, y pedirla aparte sería una segunda consulta por cada clic.
   */
  async touchDownload(token: string): Promise<{ guideSlug: string } | null> {
    const { data, error } = await this.db
      .from("guide_leads")
      .update({ last_downloaded_at: new Date().toISOString() })
      .eq("download_token", token)
      .select("guide_slug");
    if (error) throw new Error(error.message);
    const row = data?.[0];
    return row ? { guideSlug: row.guide_slug } : null;
  }

  async list(
    query: GuiaLeadsListQuery,
    slugs: readonly string[],
  ): Promise<{
    rows: GuideLeadRow[];
    total: number;
    grandTotal: number;
    countsByGuide: Record<string, number>;
  }> {
    const from = (query.page - 1) * query.perPage;
    // La aguja pasa por escapeIlike: `_` y `%` se escapan; `*` (que PostgREST reescribe a
    // `%` antes de llegar a Postgres) se reemplaza por espacio. Vacía tras sanear → sin filtro.
    const needle = query.q ? escapeIlike(query.q.toLowerCase()) : "";
    const guide = query.guide;
    const filtered = <T extends { ilike(c: string, v: string): T; eq(c: string, v: string): T }>(b: T): T => {
      let out = needle ? b.ilike("email", `%${needle}%`) : b;
      if (guide) out = out.eq("guide_slug", guide);
      return out;
    };

    // La página de datos NO pide count: con count, un offset fuera de rango devuelve 416
    // en vez de []. Los conteos van aparte (mismo patrón que clientes).
    //
    // Los conteos por guía son N consultas head en paralelo, con N = cuántas guías hay
    // (≤ 6). Si eso creciera, toca un RPC que agrupe; hoy sería complicarlo de gratis.
    const [page, matching, all, ...perGuide] = await Promise.all([
      filtered(this.db.from("guide_leads").select(ROW_COLS))
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + query.perPage - 1),
      filtered(this.db.from("guide_leads").select("id", { count: "exact", head: true })),
      this.db.from("guide_leads").select("id", { count: "exact", head: true }),
      ...slugs.map((s) =>
        this.db.from("guide_leads").select("id", { count: "exact", head: true }).eq("guide_slug", s),
      ),
    ]);
    if (page.error) throw new Error(page.error.message);
    if (matching.error) throw new Error(matching.error.message);
    if (all.error) throw new Error(all.error.message);

    const countsByGuide: Record<string, number> = {};
    slugs.forEach((s, i) => {
      const r = perGuide[i];
      if (r.error) throw new Error(r.error.message);
      countsByGuide[s] = r.count ?? 0;
    });

    return {
      rows: (page.data ?? []).map(toRow),
      total: matching.count ?? 0,
      grandTotal: all.count ?? 0,
      countsByGuide,
    };
  }

  async exportAll(query: { guide: string | null; limit: number }): Promise<GuideLeadRow[]> {
    let q = this.db.from("guide_leads").select(ROW_COLS);
    if (query.guide) q = q.eq("guide_slug", query.guide);
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(query.limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRow);
  }
}
