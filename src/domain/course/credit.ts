/**
 * Crédito de la sesión de prueba contra el curso — reglas puras, sin IO.
 *
 * /terminos: "El valor de la sesión de prueba ($19.990) se descuenta del precio
 * del curso si te inscribes dentro de los 7 días siguientes a la sesión de prueba."
 *
 * Dos detalles que salen del texto y no de la intuición:
 *  · la ventana corre desde la SESIÓN, no desde el pago;
 *  · no hay borde inferior — inscribirse ANTES de la prueba también acredita.
 */
export const TRIAL_CREDIT_DAYS = 7;

export interface CourseCredit {
  id: string;
  email: string;
  amountClp: number;
  expiresAt: string;
  consumedOrderId: string | null;
}

/** Vencimiento del crédito a partir del inicio de la sesión de prueba. */
export function creditExpiryFrom(sessionStartsAt: string | Date): string {
  const start = typeof sessionStartsAt === "string" ? new Date(sessionStartsAt) : sessionStartsAt;
  if (Number.isNaN(start.getTime())) throw new Error("curso_credito_fecha_invalida");
  return new Date(start.getTime() + TRIAL_CREDIT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** ¿Este crédito sirve para este alumno, ahora? */
export function isCreditApplicable(credit: CourseCredit, email: string, now: Date = new Date()): boolean {
  if (credit.consumedOrderId) return false;
  if (credit.email.toLowerCase() !== email.toLowerCase()) return false;
  return new Date(credit.expiresAt).getTime() > now.getTime();
}

/**
 * Cuánto se descuenta. Se acota al total: un crédito nunca puede dejar el pedido
 * en negativo (ni convertirse en un pago al alumno).
 */
export function creditDiscount(credit: CourseCredit, totalClp: number): number {
  return Math.min(credit.amountClp, totalClp);
}
