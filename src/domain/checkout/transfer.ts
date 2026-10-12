/**
 * Transferencia bancaria como respaldo del checkout público (decisión del dueño, 2026-10-12):
 * se ofrece solo con el interruptor del admin prendido y con tiempo para transferir y que el
 * dueño verifique. Las mismas cifras viven en la DB (request_transfer / declare_transfer,
 * migración 20261016120000), que es la que manda; esto solo decide qué mostrar y valida antes
 * de tomar el hold.
 */

/** Anticipación mínima para ofrecer transferencia (p_min_lead de request_transfer). */
export const TRANSFER_MIN_LEAD_MS = 3 * 60 * 60_000;

/** Plazo para transferir tras elegirla (p_window de request_transfer), en horas. */
export const TRANSFER_WINDOW_HOURS = 2;

/** ¿Se puede elegir transferencia para una sesión que empieza en `startsAt`? */
export function transferOffered(startsAt: string, now: number): boolean {
  const start = Date.parse(startsAt);
  return Number.isFinite(start) && start - now >= TRANSFER_MIN_LEAD_MS;
}
