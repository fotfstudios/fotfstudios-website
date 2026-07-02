import type { PaymentInfo } from "./payment";

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
  confirmPaid(orderId: string, payment: PaymentInfo): Promise<ConfirmPaidStatus>;
  /** Pago rechazado/cancelado: libera el horario y cancela el pedido. */
  cancelUnpaid(orderId: string): Promise<void>;
  /**
   * Reembolso (parcial o total) hecho en MP: cancela el horario, marca la orden
   * 'refunded', acumula el monto y emite NC por `amount` (o el total si no viene).
   * `refundId` se registra en `orders.mp_refund_id`. Idempotente por reembolso.
   */
  markRefunded(orderId: string, refundId?: string, amount?: number): Promise<void>;
}
