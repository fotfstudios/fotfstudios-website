import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadsRepository, LeadUpsertInput, NurtureCandidate, TouchKind } from "@/src/application/ports/outreach";
import type { NurtureStep } from "@/src/domain/outreach/nurture-schedule";
import type { AutoStage, LeadStage } from "@/src/domain/outreach/pipeline";
import type { Database } from "./database.types";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

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

  async enroll(email: string, source: string, consentAt?: Date): Promise<void> {
    const { error } = await this.db.rpc("nurture_enroll", {
      p_email: email,
      p_source: source,
      p_consent_at: consentAt ? consentAt.toISOString() : undefined,
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
}
