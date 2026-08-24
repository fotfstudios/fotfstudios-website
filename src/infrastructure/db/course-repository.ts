import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SOLICITUD_TABS,
  TAB_TO_LEAD_STATUS,
  type SolicitudTab,
  type SolicitudesListQuery,
} from "@/src/domain/admin/curso-solicitudes-list";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import type {
  CourseConflict,
  CourseGenerationRepository,
  CourseGenerationView,
  CourseSchedulingRepository,
  CourseLeadRepository,
  CourseLeadRow,
  CourseLeadsListResult,
  CourseSessionRow,
  NewGeneration,
} from "@/src/application/ports/course";
import { type CourseLeadStatus, type GenerationStatus, seatsLeft, seatsTaken } from "@/src/domain/course/course";
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

type GenRow = Database["public"]["Tables"]["course_generations"]["Row"];

type LeadRow = Database["public"]["Tables"]["course_leads"]["Row"];

function toLead(r: LeadRow): CourseLeadRow {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    plan: r.plan as CourseLeadRow["plan"],
    experience: r.experience as CourseLeadRow["experience"],
    availability: r.availability,
    message: r.message,
    status: r.status as CourseLeadStatus,
    generationId: r.generation_id,
    createdAt: r.created_at,
  };
}

export class SupabaseCourseRepository
  implements CourseSchedulingRepository, CourseGenerationRepository, CourseLeadRepository
{
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

  // ── Generaciones ─────────────────────────────────────────────────────────

  async listGenerations(): Promise<CourseGenerationView[]> {
    const { data, error } = await this.db
      .from("course_generations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return this.withSeats(data ?? []);
  }

  /** La vigente: la abierta (a lo más una, por índice parcial) o la que se dicta. */
  async currentGeneration(): Promise<CourseGenerationView | null> {
    const { data, error } = await this.db
      .from("course_generations")
      .select("*")
      .in("status", ["abierta", "en_curso"])
      // 'abierta' antes que 'en_curso': si conviven, la que recibe inscripciones manda.
      .order("status", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) return null;
    return (await this.withSeats(data))[0];
  }

  async getGeneration(id: string): Promise<CourseGenerationView | null> {
    const { data, error } = await this.db.from("course_generations").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return (await this.withSeats([data]))[0];
  }

  async createGeneration(input: NewGeneration): Promise<string> {
    const resource = await this.defaultResourceId();
    const { data, error } = await this.db
      .from("course_generations")
      .insert({
        resource_id: resource,
        code: input.code,
        name: input.name,
        seats: input.seats,
        price_duo_clp: input.prices.duo,
        price_individual_clp: input.prices.individual,
        price_prueba_clp: input.prices.prueba,
        pricing_label: input.pricingLabel ?? null,
        enroll_deadline: input.enrollDeadline ?? null,
        starts_on: input.startsOn ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async setGenerationStatus(id: string, status: GenerationStatus): Promise<void> {
    const { error } = await this.db.from("course_generations").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  /**
   * Resuelve los cupos de un lote de generaciones en UNA consulta. El conteo se
   * hace con `seatsTaken` del dominio, no con un `.eq("status", …)` acá: así la
   * definición de "qué estado ocupa cupo" vive en un solo lugar y no puede
   * separarse del índice parcial de la DB.
   */
  private async withSeats(rows: GenRow[]): Promise<CourseGenerationView[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.db
      .from("course_enrollments")
      .select("generation_id, status")
      .in("generation_id", rows.map((r) => r.id));
    if (error) throw new Error(error.message);

    const byGen = new Map<string, { status: string }[]>();
    for (const e of data ?? []) {
      const list = byGen.get(e.generation_id) ?? [];
      list.push({ status: e.status });
      byGen.set(e.generation_id, list);
    }

    return rows.map((r) => {
      const taken = seatsTaken(byGen.get(r.id) ?? []);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.status as GenerationStatus,
        seats: r.seats,
        seatsTaken: taken,
        seatsLeft: seatsLeft(r.seats, taken),
        prices: {
          duo: r.price_duo_clp,
          individual: r.price_individual_clp,
          prueba: r.price_prueba_clp,
        },
        pricingLabel: r.pricing_label,
        enrollDeadline: r.enroll_deadline,
        startsOn: r.starts_on,
        createdAt: r.created_at,
      };
    });
  }

  private async defaultResourceId(): Promise<string> {
    const { data, error } = await this.db.from("resources").select("id").eq("active", true).limit(1).single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  // ── Solicitudes (bandeja pública) ────────────────────────────────────────

  async createLead(input: CourseLeadInput, generationId: string | null): Promise<string> {
    const { data, error } = await this.db
      .from("course_leads")
      .insert({
        generation_id: generationId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        plan: input.plan,
        experience: input.experience,
        availability: input.availability,
        message: input.message,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async listLeads(q: SolicitudesListQuery): Promise<CourseLeadsListResult> {
    const from = (q.page - 1) * q.perPage;
    const status = TAB_TO_LEAD_STATUS[q.estado];

    let query = this.db
      .from("course_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + q.perPage - 1);
    if (status) query = query.eq("status", status);

    // grandTotal distingue "todavía no llega ninguna" de "este tab está vacío":
    // son dos estados vacíos con copy distinto.
    const [{ data, error }, tabCounts, grand] = await Promise.all([
      query,
      this.leadTabCounts(),
      this.db.from("course_leads").select("id", { count: "exact", head: true }),
    ]);
    if (error) throw new Error(error.message);

    return {
      rows: (data ?? []).map(toLead),
      total: tabCounts[q.estado],
      tabCounts,
      grandTotal: grand.count ?? 0,
    };
  }

  async getLead(id: string): Promise<CourseLeadRow | null> {
    const { data, error } = await this.db.from("course_leads").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toLead(data) : null;
  }

  async updateLeadStatus(id: string, status: CourseLeadStatus): Promise<void> {
    const { error } = await this.db.from("course_leads").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async nuevasCount(): Promise<number> {
    const { count } = await this.db
      .from("course_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "nueva");
    return count ?? 0;
  }

  /** Conteo por tab (head:true → sin traer filas). "todas" suma el total. */
  private async leadTabCounts(): Promise<Record<SolicitudTab, number>> {
    const entries = await Promise.all(
      SOLICITUD_TABS.map(async (tab) => {
        const status = TAB_TO_LEAD_STATUS[tab];
        let qb = this.db.from("course_leads").select("id", { count: "exact", head: true });
        if (status) qb = qb.eq("status", status);
        const { count } = await qb;
        return [tab, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<SolicitudTab, number>;
  }
}
