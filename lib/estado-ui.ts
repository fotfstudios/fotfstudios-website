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
  | "pending_payment" // no pagó todavía: "Completa tu pago"
  | "transfer"; // eligió transferencia (respaldo si MP falla): datos + "Ya transferí"

export function resolveEstadoUi(
  status: EstadoOrderStatus,
  reservation: EstadoReservationStatus,
  paymentHint: "approved" | "none",
  hintExpired: boolean,
  viaTransfer = false,
): EstadoUi {
  if (status === "paid" || status === "fulfilled") return reservation === "expired" ? "paid_no_hold" : "confirmed";
  if (status === "cancelled") return "failed";
  if (status === "refunded") return "refunded";
  // Por transferencia no hay vuelta desde MP: la pista "approved" no aplica.
  if (viaTransfer) return reservation === "expired" ? "expired" : "transfer";
  if (paymentHint === "approved" && !hintExpired) return "confirming";
  return reservation === "expired" ? "expired" : "pending_payment";
}

/**
 * ¿/reserva/estado debe mandar `purchase` ahora? Solo con el pedido pagado y una sola vez
 * (`alreadyTracked`: marca en sessionStorage). Si la página lo vio pasar de pendiente a pagado,
 * cuenta. Si llegó YA pagado (el webhook ganó la carrera, o el canje 100 % Beatcoins), cuenta
 * solo si el checkout empezó en este navegador: una visita de vuelta no es una compra nueva.
 */
export function isFreshPurchase(o: {
  status: EstadoOrderStatus;
  initialStatus: EstadoOrderStatus;
  checkoutStartedHere: boolean;
  alreadyTracked: boolean;
}): boolean {
  if (o.alreadyTracked) return false;
  if (o.status !== "paid" && o.status !== "fulfilled") return false;
  const observedTransition = o.initialStatus !== "paid" && o.initialStatus !== "fulfilled";
  return observedTransition || o.checkoutStartedHere;
}
