/**
 * Hasta cuándo se puede prometer que una reserva manual pendiente sigue guardada.
 *
 * `expire_abandoned_manual_holds_ids('72 hours')` cancela la orden cuando su reloj
 * (`greatest(orders.created_at, último payment_intents.created_at)`) es anterior a
 * `now() - 72 h`, pero solo corre en el cron diario de reconcile (vercel.json). En el
 * plan Hobby de Vercel ese cron tiene precisión de HORA: `30 12 * * *` corre en
 * cualquier momento entre las 12:00 y las 12:59 UTC, no a las 12:30.
 *
 * La promesa tiene que ser una hora en la que la reserva SEGURO sigue guardada: el
 * inicio de la ventana del cron (12:00 UTC = 09:00 CL en verano). Y si las 72 h vencen
 * DENTRO de esa ventana (p. ej. 12:10), el barrido de ese mismo día puede liberarla
 * (corre a las 12:40 > 12:10), así que la promesa es ese mismo día a las 12:00. Regla:
 * el primer 12:00 UTC en o después de (reloj + 72 h − 1 h). Nunca promete más de lo
 * que hay; a lo sumo ~1 h menos que las 72 h.
 *
 * lib/cron-contract.test.ts amarra MANUAL_HOLD_SWEEP_UTC_HOUR a la hora del cron de vercel.json.
 */
export const MANUAL_HOLD_HOURS = 72;
export const MANUAL_HOLD_SWEEP_UTC_HOUR = 12;

/**
 * @param clockStart inicio del reloj de 72 h (creación de la orden o último link de pago).
 * @param now si la promesa ya pasó (cron caído, recordatorio atrasado), se nombra la
 *   próxima ventana del barrido después de `now`: nunca una hora pasada.
 */
export function manualHoldFreesAt(clockStart: string | Date, now: Date = new Date()): Date {
  const windowLen = 3600_000; // precisión del cron en Hobby
  const earliest = new Date(clockStart).getTime() + MANUAL_HOLD_HOURS * 3600_000 - windowLen;
  const after = Math.max(earliest, now.getTime());
  const tick = new Date(after);
  tick.setUTCHours(MANUAL_HOLD_SWEEP_UTC_HOUR, 0, 0, 0);
  if (tick.getTime() < after) tick.setUTCDate(tick.getUTCDate() + 1);
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
