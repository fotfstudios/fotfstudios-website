import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadsRepository, LeadUpsertInput, NurtureCandidate, TouchKind } from "@/src/application/ports/outreach";
import type { NurtureStep } from "@/src/domain/outreach/nurture-schedule";
import { LEAD_STAGES, type AutoStage, type LeadStage } from "@/src/domain/outreach/pipeline";
import type {
  LeadDetailView,
  LeadListRow,
  LeadsListQuery,
  LeadTouchView,
} from "@/src/domain/admin/leads-list";
import type { Database } from "./database.types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

/** Fila con lo embebido (asignado + conteo de toques) que pide la lista del admin. */
type LeadRowEmbedded = LeadRow & {
  assignee: { email: string } | null;
  lead_touches: { count: number }[];
};

const SELECT_LIST = "*, assignee:admin_members!leads_assignee_member_id_fkey(email), lead_touches(count)";

function toListRow(r: LeadRowEmbedded): LeadListRow {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    source: r.source,
    stage: (r.stage as LeadStage) ?? "nuevo",
    assigneeMemberId: r.assignee_member_id,
    assigneeEmail: r.assignee?.email ?? null,
    createdAt: r.created_at,
    touchCount: r.lead_touches?.[0]?.count ?? 0,
    enrolledAt: r.enrolled_at,
    consentAt: r.consent_at,
    unsubscribedAt: r.unsubscribed_at,
    tipSentAt: r.tip_sent_at,
    trialSentAt: r.trial_sent_at,
    courseSentAt: r.course_sent_at,
    checkinSentAt: r.checkin_sent_at,
  };
}

/** Sanea `q` para un filtro ilike dentro de `.or()`: fuera los metacaracteres y lo que rompe la sintaxis. */
function ilikeTerm(q: string): string {
  return `%${q.replace(/[,()*%\\]/g, "").trim()}%`;
}

/** CRM/nurture (migración 20261103120000). Solo service_role. */
export class SupabaseLeadsRepository implements LeadsRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async upsert(input: LeadUpsertInput): Promise<string> {
    const { data, error } = await this.db.rpc("lead_upsert", {
      p_email: input.email,
      p_name: input.name ?? undefined,
      p_phone: input.phone ?? undefined,
      p_source: input.source ?? undefined,
      p_kind: input.kind,
      p_utm_source: input.utm?.source ?? undefined,
      p_utm_medium: input.utm?.medium ?? undefined,
      p_utm_campaign: input.utm?.campaign ?? undefined,
      p_utm_content: input.utm?.content ?? undefined,
      p_utm_term: input.utm?.term ?? undefined,
      p_referrer_host: input.utm?.referrerHost ?? undefined,
      p_detail: (input.detail ?? undefined) as never,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async recordTouch(email: string, kind: TouchKind, detail?: Record<string, unknown> | null): Promise<void> {
    const { error } = await this.db.rpc("lead_record_touch", {
      p_email: email,
      p_kind: kind,
      p_detail: (detail ?? undefined) as never,
    });
    if (error) throw new Error(error.message);
  }

  async enroll(email: string, source: string, consentAt?: Date, clearSuppression = false): Promise<void> {
    const { error } = await this.db.rpc("nurture_enroll", {
      p_email: email,
      p_source: source,
      p_consent_at: consentAt ? consentAt.toISOString() : undefined,
      p_clear_suppression: clearSuppression,
    });
    if (error) throw new Error(error.message);
  }

  async candidates(limit = 200): Promise<NurtureCandidate[]> {
    const { data, error } = await this.db.rpc("nurture_candidates", { p_limit: limit });
    if (error) throw new Error(error.message);
    return ((data ?? []) as LeadRow[]).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      unsubscribeToken: r.unsubscribe_token,
      enrolledAt: r.enrolled_at,
      consentAt: r.consent_at,
      unsubscribedAt: r.unsubscribed_at,
      tipSentAt: r.tip_sent_at,
      trialSentAt: r.trial_sent_at,
      courseSentAt: r.course_sent_at,
      checkinSentAt: r.checkin_sent_at,
    }));
  }

  async claimStep(id: string, step: NurtureStep): Promise<boolean> {
    const { data, error } = await this.db.rpc("nurture_claim_step", { p_id: id, p_step: step });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async releaseStep(id: string, step: NurtureStep): Promise<void> {
    const { error } = await this.db.rpc("nurture_release_step", { p_id: id, p_step: step });
    if (error) throw new Error(error.message);
  }

  async unsubscribe(token: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("nurture_unsubscribe", { p_token: token });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  }

  async advance(email: string, target: AutoStage): Promise<void> {
    const { error } = await this.db.rpc("lead_advance_stage", { p_email: email, p_target: target });
    if (error) throw new Error(error.message);
  }

  async setStage(email: string, stage: LeadStage): Promise<void> {
    const { error } = await this.db.rpc("lead_set_stage", { p_email: email, p_stage: stage });
    if (error) throw new Error(error.message);
  }

  async setNotes(email: string, notes: string): Promise<void> {
    const { error } = await this.db.rpc("lead_set_notes", { p_email: email, p_notes: notes });
    if (error) throw new Error(error.message);
  }

  async assign(email: string, memberId: string | null): Promise<void> {
    const { error } = await this.db.rpc("lead_assign", {
      p_email: email,
      p_member_id: (memberId ?? undefined) as never,
    });
    if (error) throw new Error(error.message);
  }

  // ── Lectura para el admin ──────────────────────────────────────────────────

  /** Página de la tabla: filtra por etapa y busca por correo/nombre; orden por alta desc. */
  async list(query: LeadsListQuery): Promise<{ rows: LeadListRow[]; total: number }> {
    let qb = this.db.from("leads").select(SELECT_LIST, { count: "exact" });
    if (query.stage) qb = qb.eq("stage", query.stage);
    if (query.q) {
      const term = ilikeTerm(query.q);
      qb = qb.or(`email.ilike.${term},name.ilike.${term}`);
    }
    const from = (query.page - 1) * query.perPage;
    const { data, error, count } = await qb
      .order("created_at", { ascending: false })
      .range(from, from + query.perPage - 1);
    if (error) throw new Error(error.message);
    return { rows: ((data ?? []) as unknown as LeadRowEmbedded[]).map(toListRow), total: count ?? 0 };
  }

  /** Todas las fichas (tope) para el tablero kanban; se agrupan por etapa en la página. */
  async board(limit = 500): Promise<LeadListRow[]> {
    const { data, error } = await this.db
      .from("leads")
      .select(SELECT_LIST)
      .order("stage_updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as LeadRowEmbedded[]).map(toListRow);
  }

  /** Conteo por etapa (tarjetas KPI). Cinco head-counts: O(1) de datos. */
  async stageCounts(): Promise<Record<LeadStage, number>> {
    const entries = await Promise.all(
      LEAD_STAGES.map(async (stage) => {
        const { count, error } = await this.db
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("stage", stage);
        if (error) throw new Error(error.message);
        return [stage, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<LeadStage, number>;
  }

  async exportAll(query: Pick<LeadsListQuery, "stage" | "q">, limit = 10_000): Promise<LeadListRow[]> {
    let qb = this.db.from("leads").select(SELECT_LIST);
    if (query.stage) qb = qb.eq("stage", query.stage);
    if (query.q) {
      const term = ilikeTerm(query.q);
      qb = qb.or(`email.ilike.${term},name.ilike.${term}`);
    }
    const { data, error } = await qb.order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as LeadRowEmbedded[]).map(toListRow);
  }

  /** Ficha + historia de toques (timeline de atribución) para el detalle. */
  async get(id: string): Promise<LeadDetailView | null> {
    const { data, error } = await this.db.from("leads").select(SELECT_LIST).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as unknown as LeadRowEmbedded;
    const { data: touchData, error: tErr } = await this.db
      .from("lead_touches")
      .select("id, occurred_at, kind, source, utm_source, utm_medium, utm_campaign, detail")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (tErr) throw new Error(tErr.message);
    const touches: LeadTouchView[] = (touchData ?? []).map((t) => ({
      id: t.id,
      occurredAt: t.occurred_at,
      kind: t.kind,
      source: t.source,
      utmSource: t.utm_source,
      utmMedium: t.utm_medium,
      utmCampaign: t.utm_campaign,
      detail: (t.detail ?? null) as Record<string, unknown> | null,
    }));
    return {
      ...toListRow(r),
      notes: r.notes,
      stageUpdatedAt: r.stage_updated_at,
      utmSource: r.utm_source,
      utmMedium: r.utm_medium,
      utmCampaign: r.utm_campaign,
      referrerHost: r.referrer_host,
      touches,
    };
  }

  /** Baja de nurture desde el admin (por correo): marca y suprime globalmente. */
  async pauseNurture(email: string): Promise<void> {
    const e = email.toLowerCase();
    const { error } = await this.db
      .from("leads")
      .update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("email", e);
    if (error) throw new Error(error.message);
    const { error: sErr } = await this.db
      .from("email_suppressions")
      .upsert({ email: e, reason: "admin", source: "admin" }, { onConflict: "email", ignoreDuplicates: true });
    if (sErr) throw new Error(sErr.message);
  }

  /** Miembros activos del admin para el selector de asignación. */
  async assignableMembers(): Promise<{ id: string; email: string }[]> {
    const { data, error } = await this.db
      .from("admin_members")
      .select("id, email")
      .eq("status", "active")
      .order("email");
    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
