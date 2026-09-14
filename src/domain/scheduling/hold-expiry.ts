export type ReservationStatus = "held" | "confirmed" | "cancelled" | "expired";

/**
 * Estado EFECTIVO de una reserva. El barrido (`expire_stale_holds`: cron cada minuto +
 * inline en create_checkout) es el que escribe `expired`, pero entre barridos la columna
 * miente: un `held` cuyo `expires_at` ya pasó es, para el cliente, un horario libre y una
 * reserva vencida. Un hold firme (expires_at null: reserva manual pendiente) nunca vence
 * por tiempo. Reloj inyectable para tests (mismo patrón que lib/confirmation.ts isUpcoming).
 */
export function effectiveReservationStatus(
  status: ReservationStatus,
  expiresAt: string | null,
  now: Date = new Date(),
): ReservationStatus {
  if (status !== "held" || !expiresAt) return status;
  return new Date(expiresAt).getTime() <= now.getTime() ? "expired" : "held";
}
