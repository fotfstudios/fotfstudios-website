/**
 * Qué pantalla muestra /reserva/estado. Puro (lo usa `EstadoClient` en cada render del
 * sondeo): la verdad es el estado del pedido y de la reserva en nuestra DB; la pista
 * `approved` de MP solo cambia el MENSAJE mientras el pago aún no aparece.
 */
import type { OrderConfirmation } from "@/src/application/ports/orders";

export type EstadoOrderStatus = OrderConfirmation["orderStatus"];
export type EstadoReservationStatus = OrderConfirmation["reservationStatus"];

export type EstadoUi =
  | "confirmed" // pagada y con la sala tomada
  | "paid_no_hold" // pagó, pero el hold ya había vencido
  | "failed" // pedido cancelado
  | "refunded"
  | "confirming" // volvió de MP con approved: esperando el webhook / la reconciliación
  | "expired" // no pagó y el hold venció
  | "pending_payment"; // no pagó todavía: "Completa tu pago"

export function resolveEstadoUi(
  status: EstadoOrderStatus,
  reservation: EstadoReservationStatus,
  paymentHint: "approved" | "none",
  hintExpired: boolean,
): EstadoUi {
  if (status === "paid" || status === "fulfilled") return reservation === "expired" ? "paid_no_hold" : "confirmed";
  if (status === "cancelled") return "failed";
  if (status === "refunded") return "refunded";
  if (paymentHint === "approved" && !hintExpired) return "confirming";
  return reservation === "expired" ? "expired" : "pending_payment";
}
