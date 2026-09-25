import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeIlike } from "@/src/domain/admin/reservas-list";
import type { NewsletterSubscriberRow, NovedadesListQuery } from "@/src/domain/admin/novedades-list";
import type { NewsletterSubscribeInput } from "@/src/domain/newsletter/subscribe";
import type { NewsletterRepository, NewsletterSubscription } from "@/src/application/ports/newsletter";
import type { Database } from "./database.types";

// Una sola cadena literal a propósito: partida en una concatenación, el tipado de Supabase
// deja de inferir las columnas (mismo aviso que guide-lead-repository.ts).
const ROW_COLS =
  "id, email, source, request_count, created_at, consent_at, unsubscribed_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host";

type Raw = {
  id: string;
  email: string;
  source: string;
  request_count: number;
  created_at: string;
  consent_at: string;
  unsubscribed_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_host: string | null;
};

const toRow = (r: Raw): NewsletterSubscriberRow => ({
  id: r.id,
  email: r.email,
  source: r.source,
  requestCount: r.request_count,
  createdAt: r.created_at,
  consentAt: r.consent_at,
  unsubscribedAt: r.unsubscribed_at,
  utmSource: r.utm_source,
  utmMedium: r.utm_medium,
  utmCampaign: r.utm_campaign,
  utmContent: r.utm_content,
  utmTerm: r.utm_term,
  referrerHost: r.referrer_host,
});

/** Suscriptores del newsletter sobre `newsletter_subscribers` (migración 20260925170000). */
export class SupabaseNewsletterRepository implements NewsletterRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async subscribe(input: NewsletterSubscribeInput): Promise<NewsletterSubscription> {
    const { data, error } = await this.db
      .rpc("newsletter_subscribe", {
        p_email: input.email,
        p_source: input.source,
        // null del dominio → undefined: el RPC tiene DEFAULT null en los opcionales.
        p_utm_source: input.utm.source ?? undefined,
        p_utm_medium: input.utm.medium ?? undefined,
        p_utm_campaign: input.utm.campaign ?? undefined,
        p_utm_content: input.utm.content ?? undefined,
        p_utm_term: input.utm.term ?? undefined,
        p_referrer_host: input.referrerHost ?? undefined,
      })
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id, unsubscribeToken: data.unsubscribe_token, welcome: data.welcome };
  }

  async unsubscribe(token: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("newsletter_unsubscribe", { p_token: token });
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  async list(query: NovedadesListQuery): Promise<{
    rows: NewsletterSubscriberRow[];
    total: number;
    counts: { activos: number; bajas: number; todos: number };
  }> {
    const from = (query.page - 1) * query.perPage;
    const needle = query.q ? escapeIlike(query.q.toLowerCase()) : "";
    const estado = query.estado;
    const filtered = <T extends { ilike(c: string, v: string): T; is(c: string, v: null): T; not(c: string, op: string, v: null): T }>(
      b: T,
    ): T => {
      let out = needle ? b.ilike("email", `%${needle}%`) : b;
      if (estado === "activos") out = out.is("unsubscribed_at", null);
      if (estado === "bajas") out = out.not("unsubscribed_at", "is", null);
      return out;
    };
    const head = () => this.db.from("newsletter_subscribers").select("id", { count: "exact", head: true });

    // La página NO pide count (un offset fuera de rango daría 416); los conteos van aparte.
    const [page, matching, all, activos] = await Promise.all([
      filtered(this.db.from("newsletter_subscribers").select(ROW_COLS))
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + query.perPage - 1),
      filtered(head()),
      head(),
      head().is("unsubscribed_at", null),
    ]);
    for (const r of [page, matching, all, activos]) if (r.error) throw new Error(r.error.message);

    const todos = all.count ?? 0;
    const act = activos.count ?? 0;
    return {
      rows: (page.data ?? []).map(toRow),
      total: matching.count ?? 0,
      counts: { activos: act, bajas: todos - act, todos },
    };
  }

  async exportActive(limit: number): Promise<NewsletterSubscriberRow[]> {
    const { data, error } = await this.db
      .from("newsletter_subscribers")
      .select(ROW_COLS)
      .is("unsubscribed_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRow);
  }
}
