/**
 * Cuándo se libera de verdad una reserva manual pendiente de pago.
 *
 * `expire_abandoned_manual_holds_ids('72 hours')` cancela la orden cuando su reloj
 * (`greatest(orders.created_at, último payment_intents.created_at)`) es anterior a
 * `now() - 72 h`, pero solo corre en el cron diario de reconcile (vercel.json,
 * `30 12 * * *` UTC). Así que el horario no se libera a las 72 h: se libera en el
 * primer barrido ESTRICTAMENTE posterior a esas 72 h (el SQL compara con `<`).
 * Los correos dicen esa hora, no "72 h", para no prometer un plazo que no es.
 *
 * lib/cron-contract.test.ts amarra MANUAL_HOLD_SWEEP_UTC al cron de vercel.json.
 */
export const MANUAL_HOLD_HOURS = 72;
export const MANUAL_HOLD_SWEEP_UTC = { hour: 12, minute: 30 } as const;

/**
 * @param clockStart inicio del reloj de 72 h (creación de la orden o último link de pago).
 * @param now si el plazo ya pasó (cron caído, recordatorio atrasado), se nombra el
 *   próximo barrido después de `now`: nunca una hora pasada.
 */
export function manualHoldFreesAt(clockStart: string | Date, now: Date = new Date()): Date {
  const deadline = new Date(clockStart).getTime() + MANUAL_HOLD_HOURS * 3600_000;
  const after = Math.max(deadline, now.getTime());
  const tick = new Date(after);
  tick.setUTCHours(MANUAL_HOLD_SWEEP_UTC.hour, MANUAL_HOLD_SWEEP_UTC.minute, 0, 0);
  if (tick.getTime() <= after) tick.setUTCDate(tick.getUTCDate() + 1);
  return tick;
}

/**
 * Hasta cuándo hay que pagar una reserva manual pendiente: lo que llegue primero entre
 * la liberación por el barrido (reloj de 72 h desde la creación o el último link) y el
 * INICIO de la sesión (regla del dueño: una reserva se confirma pagada antes de empezar).
 * Pasado el inicio sin pago no hay PIN (solo las confirmadas lo reciben); la orden sigue
 * pendiente hasta el barrido, por si el dueño registra un pago tardío excepcional.
 */
export function manualHoldDeadline(clockStart: string | Date, startsAt: string | null, now: Date = new Date()): Date {
  const freesAt = manualHoldFreesAt(clockStart, now);
  if (!startsAt) return freesAt;
  const start = new Date(startsAt);
  return start.getTime() < freesAt.getTime() ? start : freesAt;
}
