/** Resultado de `confirm_payment` (ver migración): reserva ok o pago sin hold. */
export type ConfirmPaidStatus = "confirmed" | "paid_no_hold";

export interface PaymentNotificationRepository {
  /** Inbox: registra el evento; devuelve false si ya estaba (duplicado). */
  recordEvent(eventId: string, topic: string, payload: unknown): Promise<boolean>;
  /** Monto esperado del pedido (CLP entero) para verificar contra el pago. */
  getOrderAmount(orderId: string): Promise<number | null>;
  /**
   * Marca pagado + confirma la reserva (idempotente). Devuelve el estado:
   * `confirmed` (reserva ok) o `paid_no_hold` (pagó pero el hold ya no existe →
   * requiere revisión del dueño; ver migración confirm_payment).
   */
  confirmPaid(orderId: string, paymentId: string): Promise<ConfirmPaidStatus>;
  /** Pago rechazado/cancelado: libera el horario y cancela el pedido. */
  cancelUnpaid(orderId: string): Promise<void>;
}
