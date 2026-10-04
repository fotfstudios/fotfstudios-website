/** Puertos del Curso de DJ. Vocabulario de dominio (camelCase); el adapter traduce. */
import type {
  CourseLeadStatus,
  CoursePlan,
  CoursePrices,
  EnrollmentStatus,
  GenerationKind,
  GenerationStatus,
} from "@/src/domain/course/course";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import type { SolicitudTab, SolicitudesListQuery } from "@/src/domain/admin/curso-solicitudes-list";
import type { CourseCredit } from "@/src/domain/course/credit";
import type { CourseSessionPlan } from "@/src/domain/course/sessions";

export interface CourseSessionRow {
  id: string;
  n: number;
  title: string;
  status: string;
  reservationId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Texto libre; el de la sesión gana sobre el del programa. */
  instructor: string | null;
}

/** Un choque entre una sesión propuesta y lo que ya hay en la sala. */
export interface CourseConflict {
  n: number;
  startsAt: string;
  endsAt: string;
  kind: string;
  status: string;
  customerName: string | null;
  amountClp: number | null;
}

export interface CourseSchedulingRepository {
  /** Read-only: qué choca con este plan, sin escribir nada. */
  previewConflicts(resourceId: string, plan: readonly CourseSessionPlan[]): Promise<CourseConflict[]>;
  /** Agenda TODAS las sesiones o ninguna. Devuelve cuántas creó. */
  scheduleSessions(generationId: string, plan: readonly CourseSessionPlan[], createdBy?: string): Promise<number>;
  /**
   * Agenda UNA sesión (curso 1:1 "por agendar"): la sala se toma recién con fecha acordada.
   * Devuelve el id de la sesión. Rechaza si ya está agendada o dictada (para eso está moveSession).
   */
  scheduleSession(
    generationId: string,
    s: { n: number; title: string; startsAt: string; endsAt: string; instructor?: string | null },
    createdBy?: string,
  ): Promise<string>;
  moveSession(sessionId: string, startsAt: string, endsAt: string, createdBy?: string): Promise<void>;
  cancelSession(sessionId: string, createdBy?: string): Promise<void>;
  listSessions(generationId: string): Promise<CourseSessionRow[]>;
}

/**
 * Una generación con su aritmética de cupos ya resuelta. Desde el curso 1:1, una
 * fila `kind="programa"` es el programa de UN pedido (1 cupo, o 2 en dúo);
 * `"cohorte"` es el formato antiguo.
 */
export interface CourseGenerationView {
  id: string;
  kind: GenerationKind;
  code: string;
  name: string;
  status: GenerationStatus;
  instructor: string | null;
  practiceHoursPerSeat: number;
  seats: number;
  seatsTaken: number;
  seatsLeft: number;
  prices: CoursePrices;
  pricingLabel: string | null;
  enrollDeadline: string | null;
  startsOn: string | null;
  createdAt: string;
}

export interface CourseGenerationRepository {
  getGeneration(id: string): Promise<CourseGenerationView | null>;
  /** Instructor del programa (texto libre; vacío = sin asignar). Las sesiones ya agendadas no cambian. */
  setProgramInstructor(generationId: string, instructor: string | null): Promise<void>;
  setSessionInstructor(sessionId: string, instructor: string | null): Promise<void>;
  /** Marca una sesión agendada como dictada. El bloque sigue ocupando la sala. */
  markSessionDictada(sessionId: string): Promise<void>;
  /**
   * Programas con al menos un alumno vivo (reservada/pagada), más recientes primero.
   * Incluye cohortes antiguas con alumnos vivos: el admin las muestra igual.
   */
  listLivePrograms(): Promise<CourseProgramView[]>;
  /** Último día para usar la práctica (YYYY-MM-DD); null = sin sesiones, no vence. Regla en SQL. */
  practiceValidUntil(generationId: string): Promise<string | null>;
}

/** Un programa como lo ve el admin: quién, cuándo, cuánta práctica le queda. */
export interface CourseProgramView {
  generationId: string;
  kind: GenerationKind;
  code: string;
  name: string;
  status: GenerationStatus;
  instructor: string | null;
  plan: CoursePlan;
  orderId: string | null;
  orderStatus: string | null;
  students: {
    enrollmentId: string;
    name: string;
    email: string;
    status: EnrollmentStatus;
    practiceHoursTotal: number;
    practiceHoursRedeemed: number;
  }[];
  sessions: CourseSessionRow[];
  /** La primera sesión agendada que aún no termina; null si no hay. */
  nextSession: CourseSessionRow | null;
  /** Último día para usar la práctica (YYYY-MM-DD); null = sin sesiones, no vence. */
  practiceValidUntil: string | null;
  createdAt: string;
}

export interface CourseLeadRow extends CourseLeadInput {
  id: string;
  status: CourseLeadStatus;
  generationId: string | null;
  createdAt: string;
}

export interface CourseLeadsListResult {
  rows: CourseLeadRow[];
  total: number;
  tabCounts: Record<SolicitudTab, number>;
  grandTotal: number;
}

export interface CourseLeadRepository {
  /** Alta pública. Ya no se estampa generación: en el curso 1:1 el programa nace al inscribir. */
  createLead(input: CourseLeadInput): Promise<string>;
  listLeads(q: SolicitudesListQuery): Promise<CourseLeadsListResult>;
  getLead(id: string): Promise<CourseLeadRow | null>;
  updateLeadStatus(id: string, status: CourseLeadStatus): Promise<void>;
  /** Badge de la barra lateral. */
  nuevasCount(): Promise<number>;
}

export interface CourseEnrollmentRow {
  id: string;
  generationId: string;
  generationCode: string;
  orderId: string | null;
  seatNo: number;
  plan: CoursePlan;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  status: EnrollmentStatus;
  priceClp: number;
  paidMethod: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  practiceHoursTotal: number;
  practiceHoursRedeemed: number;
  /** Total del PEDIDO (un dúo son dos asientos en una sola orden). */
  orderAmountClp: number | null;
  orderStatus: string | null;
}

export interface NewEnrollment {
  generationId: string;
  plan: CoursePlan;
  students: { name: string; email: string; phone?: string | null }[];
  leadId?: string | null;
  notes?: string | null;
  /** Crédito de sesión de prueba a consumir, si aplica. */
  creditId?: string | null;
  termsVersion?: string;
  termsSource?: "customer" | "staff";
}

/**
 * Un programa 1:1 nuevo. Los precios vienen de `lib/curso-content.ts` (PRECIOS) y
 * quedan congelados en la fila del programa.
 */
export interface NewProgram {
  plan: CoursePlan;
  students: { name: string; email: string; phone?: string | null }[];
  prices: CoursePrices;
  instructor?: string | null;
  leadId?: string | null;
  notes?: string | null;
  creditId?: string | null;
  termsVersion?: string;
  termsSource?: "customer" | "staff";
}

export interface CourseEnrollmentRepository {
  /** Programa + pedido + cupos en una sola transacción. */
  createProgram(input: NewProgram): Promise<{ orderId: string; generationId: string; enrollmentIds: string[] }>;
  /**
   * Inscribe en una generación YA existente (cohorte). El admin ya no la usa —
   * los programas nacen con createProgram—; queda porque la RPC sigue viva debajo de
   * create_course_program y los tests de integración arman inscripciones con ella.
   */
  createEnrollment(input: NewEnrollment): Promise<string>;
  listEnrollments(generationId: string): Promise<CourseEnrollmentRow[]>;
  enrollmentById(id: string): Promise<CourseEnrollmentRow | null>;
  enrollmentsByOrder(orderId: string): Promise<CourseEnrollmentRow[]>;
  /** Pago offline o webhook: los dos convergen en el mismo RPC. */
  confirmCoursePayment(orderId: string, paymentRef: string, method: string): Promise<"confirmed" | "noop">;
  cancelCourseOrder(orderId: string): Promise<void>;
  /**
   * Anula los cupos de un pedido YA PAGADO sin devolver plata (el dueño decidió
   * que no corresponde reembolso, o el alumno prefirió otra salida). El dinero
   * queda donde está; esto solo devuelve el asiento al inventario.
   */
  cancelPaidEnrollment(orderId: string): Promise<void>;
  /** Cambia quién asiste, no quién pagó: la boleta no se toca. */
  substituteStudent(
    enrollmentId: string,
    student: { name: string; email: string; phone?: string | null },
  ): Promise<void>;
  /** Redime horas de práctica: crea la reserva y descuenta el saldo, atómico. */
  redeemPracticeHours(
    enrollmentId: string,
    p: { startsAt: string; endsAt: string; hours: number },
  ): Promise<string>;
  /** Cancela una práctica y devuelve la hora al saldo. Idempotente. */
  releasePracticeHours(reservationId: string): Promise<void>;
  practiceRedemptions(enrollmentId: string): Promise<
    {
      id: string;
      reservationId: string;
      hours: number;
      startsAt: string | null;
      endsAt: string | null;
      releasedAt: string | null;
    }[]
  >;
  setEnrollmentNotes(id: string, notes: string | null): Promise<void>;
}

/**
 * Finaliza el pago de un curso desde el webhook. Espejo de RescheduleFinalizer:
 * ambos existen porque su pedido NO tiene reserva y confirm_payment los mandaría
 * a 'paid_no_hold' (sin boleta y con el cliente en silencio).
 */
export interface CourseFinalizer {
  /** ¿Este pedido es una inscripción de curso pendiente? Desvía del confirm normal. */
  pendingCourseOrder(orderId: string): Promise<{ orderId: string } | null>;
  /** Confirma cupos + boleta. 'noop' si la inscripción ya se anuló o ya estaba pagada. */
  applyCoursePayment(orderId: string, paymentId: string): Promise<"applied" | "noop">;
}

export interface CourseCreditRepository {
  /** Emite el crédito de una sesión de prueba. Idempotente por reserva de origen. */
  issueTrialCredit(input: {
    email: string;
    amountClp: number;
    sessionStartsAt: string;
    sourceReservationId?: string | null;
    note?: string | null;
  }): Promise<string>;
  /** Crédito vigente y sin usar de este email, si lo hay. */
  applicableCredit(email: string): Promise<CourseCredit | null>;
  listCredits(): Promise<(CourseCredit & { issuedAt: string; note: string | null })[]>;
}

/** Lo que un alumno ve de su propio curso. */
export interface StudentCourseView {
  enrollmentId: string;
  generationCode: string;
  generationName: string;
  status: EnrollmentStatus;
  plan: CoursePlan;
  priceClp: number;
  orderAmountClp: number | null;
  paidAt: string | null;
  seatNo: number;
  instructor: string | null;
  practiceHoursTotal: number;
  practiceHoursRedeemed: number;
  /** YYYY-MM-DD; null = sin sesiones agendadas, no vence. */
  practiceValidUntil: string | null;
  sessions: { n: number; title: string; startsAt: string | null; endsAt: string | null; status: string }[];
  /** Horas de práctica agendadas (no canceladas), por fecha. */
  practice: { startsAt: string; endsAt: string; hours: number }[];
}
