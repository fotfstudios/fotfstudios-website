/** Puertos del Curso de DJ. Vocabulario de dominio (camelCase); el adapter traduce. */
import type {
  CourseLeadStatus,
  CoursePlan,
  CoursePrices,
  EnrollmentStatus,
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
  moveSession(sessionId: string, startsAt: string, endsAt: string, createdBy?: string): Promise<void>;
  cancelSession(sessionId: string, createdBy?: string): Promise<void>;
  listSessions(generationId: string): Promise<CourseSessionRow[]>;
}

/** Una generación con su aritmética de cupos ya resuelta. */
export interface CourseGenerationView {
  id: string;
  code: string;
  name: string;
  status: GenerationStatus;
  seats: number;
  seatsTaken: number;
  seatsLeft: number;
  prices: CoursePrices;
  pricingLabel: string | null;
  enrollDeadline: string | null;
  startsOn: string | null;
  createdAt: string;
}

export interface NewGeneration {
  code: string;
  name: string;
  seats: number;
  prices: CoursePrices;
  pricingLabel?: string | null;
  enrollDeadline?: string | null;
  startsOn?: string | null;
}

export interface CourseGenerationRepository {
  listGenerations(): Promise<CourseGenerationView[]>;
  /** La generación vigente: la abierta, o la que está dictándose. */
  currentGeneration(): Promise<CourseGenerationView | null>;
  getGeneration(id: string): Promise<CourseGenerationView | null>;
  createGeneration(input: NewGeneration): Promise<string>;
  setGenerationStatus(id: string, status: GenerationStatus): Promise<void>;
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
  /** Alta pública. `generationId` estampa la generación vigente al enviar. */
  createLead(input: CourseLeadInput, generationId: string | null): Promise<string>;
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

export interface CourseEnrollmentRepository {
  /** Toma los cupos y crea el pedido en una sola transacción. Devuelve el orderId. */
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
  /** Traspasa el cupo a otra generación. Devuelve el id de la inscripción nueva. */
  transferEnrollment(enrollmentId: string, targetGenerationId: string): Promise<string>;
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
    { id: string; reservationId: string; hours: number; startsAt: string | null; releasedAt: string | null }[]
  >;
  setEnrollmentNotes(id: string, notes: string | null): Promise<void>;
}

export interface CourseTaxDoc {
  id: string;
  kind: string;
  status: string;
  folio: string | null;
  neto: number;
  iva: number;
  total: number;
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
  sessions: { n: number; title: string; startsAt: string | null; status: string }[];
}
