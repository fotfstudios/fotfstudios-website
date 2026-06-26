export interface PaymentNotificationRepository {
  /** Inbox: registra el evento; devuelve false si ya estaba (duplicado). */
  recordEvent(eventId: string, topic: string, payload: unknown): Promise<boolean>;
  /** Marca pagado + confirma la reserva (idempotente). */
  confirmPaid(orderId: string, paymentId: string): Promise<void>;
  /** Pago rechazado/cancelado: libera el horario y cancela el pedido. */
  cancelUnpaid(orderId: string): Promise<void>;
}
