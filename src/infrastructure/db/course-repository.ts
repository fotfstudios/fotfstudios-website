import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CourseConflict,
  CourseSchedulingRepository,
  CourseSessionRow,
} from "@/src/application/ports/course";
import type { CourseSessionPlan } from "@/src/domain/course/sessions";
import type { Database } from "./database.types";

/**
 * Único lugar donde el plan de sesiones (camelCase, dominio) se traduce al payload
 * de los RPC (snake_case, DB). Antes de que existiera, el mapeo vivía implícito en
 * el caller y una `startsAt` sin traducir llegaba como NULL a la inserción.
 */
function toPayload(plan: readonly CourseSessionPlan[]) {
  return plan.map((s) => ({ n: s.n, title: s.title, starts_at: s.startsAt, ends_at: s.endsAt }));
}

/** Los RPC codifican el número de sesión en el mensaje: `curso_slot_taken:3`. */
export function courseSessionErrorNumber(message: string): number | null {
  const m = /curso_(?:slot_taken|in_past|bad_range):(\d+)/.exec(message);
  return m ? Number(m[1]) : null;
}

export class SupabaseCourseRepository implements CourseSchedulingRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async previewConflicts(resourceId: string, plan: readonly CourseSessionPlan[]): Promise<CourseConflict[]> {
    const { data, error } = await this.db.rpc("preview_course_conflicts", {
      p_resource: resourceId,
      p_sessions: toPayload(plan),
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      n: r.n,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      kind: r.conflict_kind,
      status: r.conflict_status,
      customerName: r.conflict_customer,
      amountClp: r.conflict_amount,
    }));
  }

  async scheduleSessions(
    generationId: string,
    plan: readonly CourseSessionPlan[],
    createdBy?: string,
  ): Promise<number> {
    const { data, error } = await this.db.rpc("schedule_course_generation", {
      p_generation: generationId,
      p_sessions: toPayload(plan),
      p_created_by: createdBy ?? undefined,
    });
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  async moveSession(sessionId: string, startsAt: string, endsAt: string, createdBy?: string): Promise<void> {
    const { error } = await this.db.rpc("move_course_session", {
      p_session: sessionId,
      p_starts: startsAt,
      p_ends: endsAt,
      p_created_by: createdBy ?? undefined,
    });
    if (error) throw new Error(error.message);
  }

  async cancelSession(sessionId: string, createdBy?: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_course_session", {
      p_session: sessionId,
      p_created_by: createdBy ?? undefined,
    });
    if (error) throw new Error(error.message);
  }

  async listSessions(generationId: string): Promise<CourseSessionRow[]> {
    const { data, error } = await this.db
      .from("course_sessions")
      .select("id, n, title, status, reservation_id, reservations(starts_at, ends_at)")
      .eq("generation_id", generationId)
      .order("n", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      n: r.n,
      title: r.title,
      status: r.status,
      reservationId: r.reservation_id,
      startsAt: r.reservations?.starts_at ?? null,
      endsAt: r.reservations?.ends_at ?? null,
    }));
  }
}
