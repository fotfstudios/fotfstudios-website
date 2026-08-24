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
  CourseEnrollmentRepository,
  CourseEnrollmentRow,
  CourseCreditRepository,
  CourseFinalizer,
  CourseLeadRepository,
  CourseLeadRow,
  CourseLeadsListResult,
  CourseSessionRow,
  CourseTaxDoc,
  StudentCourseView,
  NewEnrollment,
  NewGeneration,
} from "@/src/application/ports/course";
import {
  type CourseLeadStatus,
  type CoursePlan,
  type EnrollmentStatus,
  type GenerationStatus,
  seatsLeft,
  seatsTaken,
} from "@/src/domain/course/course";
import { netFromGrossInclusive, taxFromGrossInclusive } from "@/src/domain/money/money";
import { type CourseCredit, creditDiscount, creditExpiryFrom, isCreditApplicable } from "@/src/domain/course/credit";
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

function toCredit(r: {
  id: string;
  email: string;
  amount_clp: number;
  expires_at: string;
  consumed_order_id: string | null;
}): CourseCredit {
  return {
    id: r.id,
    email: r.email,
    amountClp: r.amount_clp,
    expiresAt: r.expires_at,
    consumedOrderId: r.consumed_order_id,
  };
}

const ENROLLMENT_SELECT =
  "id, generation_id, order_id, seat_no, plan, student_name, student_email, student_phone, " +
  "status, price_clp, paid_method, paid_at, notes, created_at, practice_hours_total, " +
  "practice_hours_redeemed, orders(amount_clp, status)";

type EnrollmentJoin = {
  id: string;
  generation_id: string;
  order_id: string | null;
  seat_no: number;
  plan: string;
  student_name: string;
  student_email: string;
  student_phone: string | null;
  status: string;
  price_clp: number;
  paid_method: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  practice_hours_total: number;
  practice_hours_redeemed: number;
  orders: { amount_clp: number; status: string } | null;
  course_generations: { code: string } | null;
};

function toEnrollment(r: EnrollmentJoin): CourseEnrollmentRow {
  return {
    id: r.id,
    generationId: r.generation_id,
    generationCode: r.course_generations?.code ?? "",
    orderId: r.order_id,
    seatNo: r.seat_no,
    plan: r.plan as CoursePlan,
    studentName: r.student_name,
    studentEmail: r.student_email,
    studentPhone: r.student_phone,
    status: r.status as EnrollmentStatus,
    priceClp: r.price_clp,
    paidMethod: r.paid_method,
    paidAt: r.paid_at,
    notes: r.notes,
    createdAt: r.created_at,
    practiceHoursTotal: r.practice_hours_total,
    practiceHoursRedeemed: r.practice_hours_redeemed,
    orderAmountClp: r.orders?.amount_clp ?? null,
    orderStatus: r.orders?.status ?? null,
  };
}

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
  implements
    CourseSchedulingRepository,
    CourseGenerationRepository,
    CourseLeadRepository,
    CourseEnrollmentRepository,
    CourseCreditRepository,
    CourseFinalizer
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

  // ── Inscripciones ────────────────────────────────────────────────────────

  async createEnrollment(input: NewEnrollment): Promise<string> {
    const gen = await this.getGeneration(input.generationId);
    if (!gen) throw new Error("curso_generation_missing");

    // El precio sale de la GENERACIÓN, nunca del formulario: el admin elige a
    // quién inscribir, no cuánto cobrarle.
    const unit = input.plan === "duo" ? gen.prices.duo : gen.prices.individual;
    const bruto = unit * input.students.length;

    // El crédito baja el EFECTIVO: el pedido cobra menos, y la boleta cubre
    // exactamente lo cobrado. El precio de lista queda en la línea del curso.
    let amount = bruto;
    if (input.creditId) {
      const credit = await this.creditById(input.creditId);
      if (!credit) throw new Error("curso_credito_no_disponible");
      amount = bruto - creditDiscount(credit, bruto);
    }
    const taxPct = await this.ivaPct();

    const { data, error } = await this.db.rpc("create_course_enrollment", {
      p_generation: input.generationId,
      p_plan: input.plan,
      p_students: input.students.map((s) => ({
        name: s.name,
        email: s.email,
        phone: s.phone ?? null,
      })),
      p_amount: amount,
      p_net: netFromGrossInclusive(amount, taxPct),
      p_tax: taxFromGrossInclusive(amount, taxPct),
      p_lead: input.leadId ?? undefined,
      p_terms_version: input.termsVersion ?? undefined,
      p_terms_source: input.termsSource ?? undefined,
      p_notes: input.notes ?? undefined,
      p_credit: input.creditId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return data as unknown as string;
  }

  async listEnrollments(generationId: string): Promise<CourseEnrollmentRow[]> {
    const { data, error } = await this.db
      .from("course_enrollments")
      .select(`${ENROLLMENT_SELECT}, course_generations(code)`)
      .eq("generation_id", generationId)
      .order("seat_no", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toEnrollment);
  }

  async enrollmentById(id: string): Promise<CourseEnrollmentRow | null> {
    const { data, error } = await this.db
      .from("course_enrollments")
      .select(`${ENROLLMENT_SELECT}, course_generations(code)`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEnrollment(data) : null;
  }

  async enrollmentsByOrder(orderId: string): Promise<CourseEnrollmentRow[]> {
    const { data, error } = await this.db
      .from("course_enrollments")
      .select(`${ENROLLMENT_SELECT}, course_generations(code)`)
      .eq("order_id", orderId)
      .order("seat_no", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toEnrollment);
  }

  async confirmCoursePayment(
    orderId: string,
    paymentRef: string,
    method: string,
  ): Promise<"confirmed" | "noop"> {
    const { data, error } = await this.db.rpc("confirm_course_payment", {
      p_order: orderId,
      p_payment_id: paymentRef,
      p_method: method,
    });
    if (error) throw new Error(error.message);
    // Cualquier valor inesperado se trata como 'noop': falla cerrado, nunca
    // reporta un cobro que no ocurrió.
    return data === "confirmed" ? "confirmed" : "noop";
  }

  async cancelCourseOrder(orderId: string): Promise<void> {
    const { error } = await this.db.rpc("cancel_course_order", { p_order: orderId });
    if (error) throw new Error(error.message);
  }

  async cancelPaidEnrollment(orderId: string): Promise<void> {
    const { error } = await this.db
      .from("course_enrollments")
      .update({ status: "anulada", cancelled_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("status", ["reservada", "pagada"]);
    if (error) throw new Error(error.message);
  }

  async transferEnrollment(enrollmentId: string, targetGenerationId: string): Promise<string> {
    const { data, error } = await this.db.rpc("transfer_enrollment", {
      p_enrollment: enrollmentId,
      p_target: targetGenerationId,
    });
    if (error) throw new Error(error.message);
    return data as unknown as string;
  }

  async substituteStudent(
    enrollmentId: string,
    student: { name: string; email: string; phone?: string | null },
  ): Promise<void> {
    const { error } = await this.db.rpc("substitute_student", {
      p_enrollment: enrollmentId,
      p_name: student.name,
      p_email: student.email,
      p_phone: student.phone ?? undefined,
    });
    if (error) throw new Error(error.message);
  }

  async redeemPracticeHours(
    enrollmentId: string,
    p: { startsAt: string; endsAt: string; hours: number },
  ): Promise<string> {
    const { data, error } = await this.db.rpc("redeem_practice_hours", {
      p_enrollment: enrollmentId,
      p_starts: p.startsAt,
      p_ends: p.endsAt,
      p_hours: p.hours,
    });
    if (error) throw new Error(error.message);
    return data as unknown as string;
  }

  async releasePracticeHours(reservationId: string): Promise<void> {
    const { error } = await this.db.rpc("release_practice_hours", { p_reservation: reservationId });
    if (error) throw new Error(error.message);
  }

  async practiceRedemptions(enrollmentId: string) {
    const { data, error } = await this.db
      .from("course_practice_redemptions")
      .select("id, reservation_id, hours, released_at, reservations(starts_at)")
      .eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      reservationId: r.reservation_id,
      hours: r.hours,
      startsAt: r.reservations?.starts_at ?? null,
      releasedAt: r.released_at,
    }));
  }

  async setEnrollmentNotes(id: string, notes: string | null): Promise<void> {
    const { error } = await this.db.from("course_enrollments").update({ notes }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  /** IVA vigente desde el catálogo; el monto del pedido es bruto IVA-incluido. */
  private async ivaPct(): Promise<number> {
    const { data, error } = await this.db.from("tax_rates").select("pct").eq("code", "IVA").single();
    if (error) throw new Error(error.message);
    return Number(data.pct);
  }

  /** Documentos tributarios del pedido (boleta + notas de crédito, si las hay). */
  async taxDocumentsForOrder(orderId: string): Promise<CourseTaxDoc[]> {
    const { data, error } = await this.db
      .from("tax_documents")
      .select("id, kind, status, folio, neto, iva, total, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      folio: d.folio,
      neto: d.neto,
      iva: d.iva,
      total: d.total,
    }));
  }

  // ── Finalizador del webhook ──────────────────────────────────────────────

  /**
   * ¿El pedido es una inscripción de curso todavía sin pagar? Devuelve null para
   * cualquier otra cosa, así el webhook sigue de largo hacia el camino normal.
   */
  async pendingCourseOrder(orderId: string): Promise<{ orderId: string } | null> {
    const { data, error } = await this.db
      .from("orders")
      .select("id, kind, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.kind !== "course") return null;
    // Un pedido de curso ya pagado igual se desvía: reprocesar por el camino de
    // reservas lo mandaría a 'paid_no_hold' y dispararía una alerta falsa.
    return { orderId: data.id };
  }

  async applyCoursePayment(orderId: string, paymentId: string): Promise<"applied" | "noop"> {
    const status = await this.confirmCoursePayment(orderId, paymentId, "mercadopago");
    return status === "confirmed" ? "applied" : "noop";
  }

  // ── Crédito de la sesión de prueba ───────────────────────────────────────

  async issueTrialCredit(input: {
    email: string;
    amountClp: number;
    sessionStartsAt: string;
    sourceReservationId?: string | null;
    note?: string | null;
  }): Promise<string> {
    const { data, error } = await this.db
      .from("course_credits")
      .insert({
        email: input.email.toLowerCase(),
        amount_clp: input.amountClp,
        expires_at: creditExpiryFrom(input.sessionStartsAt),
        source_reservation_id: input.sourceReservationId ?? null,
        note: input.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  /**
   * El crédito vigente de este email. Se filtra en la DB por lo barato (sin
   * consumir, no vencido) y se confirma con la regla del dominio, que es la
   * única fuente de "aplicable".
   */
  async applicableCredit(email: string): Promise<CourseCredit | null> {
    const { data, error } = await this.db
      .from("course_credits")
      .select("id, email, amount_clp, expires_at, consumed_order_id")
      .eq("email", email.toLowerCase())
      .is("consumed_order_id", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const credit = toCredit(data);
    return isCreditApplicable(credit, email) ? credit : null;
  }

  async listCredits(): Promise<(CourseCredit & { issuedAt: string; note: string | null })[]> {
    const { data, error } = await this.db
      .from("course_credits")
      .select("id, email, amount_clp, expires_at, consumed_order_id, issued_at, note")
      .order("issued_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...toCredit(r), issuedAt: r.issued_at, note: r.note }));
  }

  private async creditById(id: string): Promise<CourseCredit | null> {
    const { data, error } = await this.db
      .from("course_credits")
      .select("id, email, amount_clp, expires_at, consumed_order_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toCredit(data) : null;
  }

  /**
   * Los cursos de un alumno, por email.
   *
   * El portal del cliente lista reservas con `kind='booking'`, así que el curso
   * no aparece solo: no es una reserva, es un asiento. Se consulta por email con
   * el mismo cuidado que bookingsForEmail — ilike para no distinguir mayúsculas
   * y re-filtro exacto en minúsculas, porque ilike trata `_` como comodín y por
   * ahí se podría colar la inscripción de otra persona.
   */
  async coursesForEmail(email: string): Promise<StudentCourseView[]> {
    const lower = email.toLowerCase();
    const { data, error } = await this.db
      .from("course_enrollments")
      // Literal, no concatenado: el inferidor de tipos de PostgREST necesita el
      // string literal para resolver las relaciones embebidas.
      .select(
        "id, generation_id, seat_no, plan, status, price_clp, paid_at, student_email, orders(amount_clp), course_generations(code, name)",
      )
      .ilike("student_email", email)
      .in("status", ["reservada", "pagada"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const rows = (data ?? []).filter((r) => r.student_email?.toLowerCase() === lower);
    return Promise.all(
      rows.map(async (r) => {
        const sessions = await this.listSessions(r.generation_id);
        return {
          enrollmentId: r.id,
          generationCode: r.course_generations?.code ?? "",
          generationName: r.course_generations?.name ?? "",
          status: r.status as StudentCourseView["status"],
          plan: r.plan as StudentCourseView["plan"],
          priceClp: r.price_clp,
          orderAmountClp: r.orders?.amount_clp ?? null,
          paidAt: r.paid_at,
          seatNo: r.seat_no,
          sessions: sessions
            .filter((s) => s.status === "agendada")
            .map((s) => ({ n: s.n, title: s.title, startsAt: s.startsAt, status: s.status })),
        };
      }),
    );
  }
}
