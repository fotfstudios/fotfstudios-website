/**
 * Vencimiento de Beatcoins (decisión del dueño, 2026-10-10). Espejo puro de la migración
 * 20261014120100 (beatcoins_settings + beatcoins_expires_at), para la UI y los correos:
 *
 *   · Lo ganado DESDE el corte vence 12 meses después de la última reserva pagada
 *     (con dinero o con Beatcoins); cada reserva reinicia el reloj.
 *   · Lo ganado antes del corte nunca vence (`points_protected` en la DB).
 *   · Se gastan primero los que vencen.
 *
 * El corte vive en la DB (una fila) y acá: el itest verifica que coincidan. Moverlo es
 * una migración de una línea + este valor + /terminos.
 */

/** Desde cuándo lo ganado vence. Medianoche de Chile (UTC−3 en noviembre). */
export const BEATCOINS_EXPIRY_FROM = "2026-11-10T00:00:00-03:00";
export const BEATCOINS_EXPIRY_MONTHS = 12;

/** Cuánto del saldo vence: lo que no está protegido (nunca negativo). */
export function expirableAmount(balance: number, protectedAmount: number): number {
  return Math.max(balance - protectedAmount, 0);
}

/**
 * Cuándo vence la parte que vence: 12 meses desde la última reserva pagada, pero nunca
 * antes de 12 meses desde el corte. Mismo cálculo que `beatcoins_expires_at` en SQL.
 */
export function beatcoinsExpiresAt(activityAt: string | null, from: string = BEATCOINS_EXPIRY_FROM): Date {
  const cutoff = new Date(from);
  const base = activityAt && new Date(activityAt) > cutoff ? new Date(activityAt) : cutoff;
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + BEATCOINS_EXPIRY_MONTHS);
  return d;
}

export interface BeatcoinsExpiry {
  /** Beatcoins que vencen (0 = nada vence). */
  expiring: number;
  /** Beatcoins que nunca vencen. */
  permanent: number;
  /** Fecha de vencimiento de `expiring`; null si no hay nada que venza. */
  expiresAt: Date | null;
}

/** Resumen para la cuenta, el admin y los correos. */
export function beatcoinsExpiry(v: { balance: number; protected: number; activityAt: string | null }): BeatcoinsExpiry {
  const expiring = expirableAmount(v.balance, v.protected);
  return {
    expiring,
    permanent: Math.max(Math.min(v.protected, v.balance), 0),
    expiresAt: expiring > 0 ? beatcoinsExpiresAt(v.activityAt) : null,
  };
}

/** ¿Vale la pena avisarlo en el checkout? Solo cuando vence en ≤ 30 días. */
export function expiresSoon(e: BeatcoinsExpiry, now: Date, days = 30): boolean {
  return e.expiresAt !== null && e.expiresAt.getTime() - now.getTime() <= days * 86_400_000;
}
