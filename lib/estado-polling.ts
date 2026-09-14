/**
 * Política de sondeo de /reserva/estado — pura, la isla la aplica con setTimeout.
 * Antes: cada 3 s para siempre (194 polls en 10 min en la auditoría), y cada poll es una
 * consulta a Mercado Pago. Ahora: rápido mientras el pago puede estar llegando, lento
 * después, y se corta cuando ya no hay nada que esperar (orden terminal, hold vencido,
 * o tope duro para holds firmes sin vencimiento).
 */
export const POLL_FAST_MS = 3_000;
export const POLL_SLOW_MS = 15_000;
export const POLL_FAST_WINDOW_MS = 2 * 60_000;
export const POLL_GRACE_AFTER_EXPIRY_MS = 2 * 60_000;
export const POLL_MAX_MS = 30 * 60_000;

const TERMINAL: ReadonlySet<string> = new Set(["paid", "fulfilled", "cancelled", "refunded"]);

export interface PollInput {
  orderStatus: string;
  reservationStatus: string | null;
  holdExpiresAt: string | null;
  /** Date.now() al montar la isla. */
  startedAt: number;
  now: number;
}

/** Próximo intervalo en ms, o null cuando ya no hay nada que esperar. */
export function nextPollDelay(i: PollInput): number | null {
  if (TERMINAL.has(i.orderStatus)) return null;
  if (i.reservationStatus === "expired" || i.reservationStatus === "cancelled") return null;
  const elapsed = i.now - i.startedAt;
  if (elapsed >= POLL_MAX_MS) return null;
  if (i.holdExpiresAt && i.now >= Date.parse(i.holdExpiresAt) + POLL_GRACE_AFTER_EXPIRY_MS) return null;
  return elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}
