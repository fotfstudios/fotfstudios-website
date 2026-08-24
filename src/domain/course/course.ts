/**
 * Curso de Iniciación DJ — catálogos y aritmética de cupos. Lógica pura, sin IO.
 *
 * La unidad escasa es el ASIENTO, y un asiento es una FILA de course_enrollments
 * (un dúo son dos filas compartiendo pedido). Acá vive solo la aritmética de
 * lectura: quién ocupa cupo y cuántos quedan. La garantía anti-sobreventa NO está
 * acá sino en Postgres — índice único parcial + trigger de rango — porque un
 * contador en la app no sobrevive a dos checkouts concurrentes.
 */

export const GENERATION_STATUSES = ["borrador", "abierta", "en_curso", "cerrada", "cancelada"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const GENERATION_STATUS_LABELS: Record<GenerationStatus, string> = {
  borrador: "Borrador",
  abierta: "Abierta",
  en_curso: "En curso",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const ENROLLMENT_STATUSES = ["reservada", "pagada", "anulada", "expirada", "trasladada"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  reservada: "Por pagar",
  pagada: "Pagada",
  anulada: "Anulada",
  expirada: "Expirada",
  trasladada: "Trasladada",
};

export const COURSE_LEAD_STATUSES = ["nueva", "contactada", "inscrita", "descartada"] as const;
export type CourseLeadStatus = (typeof COURSE_LEAD_STATUSES)[number];

/**
 * Estados que OCUPAN cupo. Debe espejar exactamente el índice parcial
 * `course_enrollments_seat_unique ... where status in ('reservada','pagada')`.
 * Si divergen, la app contaría distinto que la DB: el test de integración compara
 * ambos lados contra la misma generación para que no se separen en silencio.
 */
export const SEAT_HOLDING_STATUSES = ["reservada", "pagada"] as const;
export type SeatHoldingStatus = (typeof SEAT_HOLDING_STATUSES)[number];

export function holdsSeat(status: string): status is SeatHoldingStatus {
  return (SEAT_HOLDING_STATUSES as readonly string[]).includes(status);
}

/** Planes cobrables. `prueba`/`no_se` existen solo como interés en una solicitud. */
export const COURSE_PLANS = ["duo", "individual"] as const;
export type CoursePlan = (typeof COURSE_PLANS)[number];

export const LEAD_PLANS = ["duo", "individual", "prueba", "no_se"] as const;
export type LeadPlan = (typeof LEAD_PLANS)[number];

/** Etiquetas para el ADMIN: habla *sobre* una persona ("aún no sabe"). */
export const LEAD_PLAN_LABELS: Record<LeadPlan, string> = {
  duo: "En dúo",
  individual: "Individual",
  prueba: "Sesión de prueba",
  no_se: "Aún no sabe",
};

/** Etiquetas para el FORMULARIO: le habla *a* la persona ("aún no sé"). */
export const LEAD_PLAN_LABELS_PUBLIC: Record<LeadPlan, string> = {
  duo: "En dúo",
  individual: "Individual",
  prueba: "Primero la sesión de prueba",
  no_se: "Aún no sé",
};

export const EXPERIENCE_LEVELS = ["cero", "controlador", "club"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** Etiquetas para el ADMIN (tercera persona). */
export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  cero: "Nunca ha tocado",
  controlador: "Practica con controlador",
  club: "Ya mezcla en equipos de club",
};

/** Etiquetas para el FORMULARIO (segunda persona, voz de marca). */
export const EXPERIENCE_LABELS_PUBLIC: Record<ExperienceLevel, string> = {
  cero: "Nunca he tocado",
  controlador: "Practico con controlador",
  club: "Ya mezclo en equipos de club",
};

/** Precios congelados por generación. CLP, IVA incluido; `duo` es POR PERSONA. */
export interface CoursePrices {
  duo: number;
  individual: number;
  prueba: number;
}

/** Cuánto cuesta UN asiento en este plan (el dúo cobra este monto a cada persona). */
export function priceFor(prices: CoursePrices, plan: CoursePlan): number {
  return plan === "duo" ? prices.duo : prices.individual;
}

/** Cuántos asientos ocupa el plan: el dúo entra de a dos o no entra. */
export function seatsNeeded(plan: CoursePlan): number {
  return plan === "duo" ? 2 : 1;
}

/** Cupos ocupados: solo cuentan las inscripciones vivas. */
export function seatsTaken(enrollments: readonly { status: string }[]): number {
  return enrollments.filter((e) => holdsSeat(e.status)).length;
}

/** Cupos libres, nunca negativo (una generación puede achicar `seats` con gente dentro). */
export function seatsLeft(seats: number, taken: number): number {
  return Math.max(0, seats - taken);
}

export function isFull(seats: number, taken: number): boolean {
  return seatsLeft(seats, taken) === 0;
}

/** ¿Cabe este plan? Un dúo con un solo cupo libre NO cabe. */
export function fitsInGeneration(seats: number, taken: number, plan: CoursePlan): boolean {
  return seatsLeft(seats, taken) >= seatsNeeded(plan);
}
