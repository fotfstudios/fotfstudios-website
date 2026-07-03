import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

export type WebhookOutcome =
  | "paid"
  | "paid_unreserved"
  | "rejected"
  | "refunded"
  | "pending"
  | "duplicate"
  | "ignored";

export interface WebhookResult {
  result: WebhookOutcome;
  orderId: string | null;
  /** Suma de los reembolsos FRESCOS procesados (solo cuando result === "refunded"). */
  refundedAmount?: number;
}

/**
 * Procesa una notificación de pago de Mercado Pago. El estado se obtiene de la
 * API de MP (fuente de verdad), no del body.
 *
 * Idempotencia por inbox:
 *  - Reembolsos: uno por `refund:{id}` (un reembolso parcial NO cambia el status
 *    del pago → no podemos keyear por status; cada reembolso de `refunds[]` se
 *    procesa una vez). Cualquier reembolso cancela la reserva y emite NC por su monto.
 *  - Aprobación/rechazo: por `{paymentId}:{status}`.
 */
export class WebhookService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repo: PaymentNotificationRepository,
  ) {}

  async handlePaymentNotification(paymentId: string): Promise<WebhookResult> {
    const payment = await this.gateway.getPayment(paymentId);
    const orderId = payment.externalReference ?? null;

    // Reembolsos (parciales o totales) primero: keyeados por refund id, porque un
    // reembolso parcial deja el pago en 'approved' (colisionaría con la aprobación).
    // Un reembolso iniciado desde el ADMIN ya viene registrado en el inbox
    // (RefundService, inbox-first) → aquí cae como duplicado: sin doble NC/email.
    let refunded = false;
    let refundedAmount = 0;
    for (const r of payment.refunds ?? []) {
      const freshRefund = await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
      if (freshRefund && orderId) {
        await this.repo.markRefunded(orderId, r.id, r.amount);
        refunded = true;
        refundedAmount += r.amount;
      }
    }
    if (refunded) return { result: "refunded", orderId, refundedAmount };

    // Transición de estado del pago (aprobación/rechazo), idempotente por status.
    const fresh = await this.repo.recordEvent(`${paymentId}:${payment.status}`, "payment", payment);
    if (!fresh) return { result: "duplicate", orderId };

    if (!orderId) return { result: "ignored", orderId };

    if (payment.status === "approved") {
      // Verificar monto contra el snapshot del pedido (defensa en profundidad).
      const expected = await this.repo.getOrderAmount(orderId);
      if (expected != null && payment.amount != null && payment.amount !== expected) {
        console.error(
          `[webhook] monto no coincide: pago ${payment.amount} vs pedido ${expected} (order ${orderId})`,
        );
        return { result: "ignored", orderId };
      }
      const status = await this.repo.confirmPaid(orderId, payment);
      // `paid_no_hold`: pagó pero la reserva ya no estaba en hold → revisión del dueño.
      return { result: status === "paid_no_hold" ? "paid_unreserved" : "paid", orderId };
    }
    if (payment.status === "rejected" || payment.status === "cancelled") {
      // NO cancelar el pedido: Checkout Pro ofrece reintentar con otro medio
      // dentro del MISMO checkout (recovery de pagos rechazados), y el hold de
      // 10 min ya es la limpieza natural. Cancelar aquí liberaba el cupo en
      // pleno reintento → pago aprobado sin reserva (paid_no_hold, revisión
      // manual). Un rechazo abandonado queda igual que un checkout abandonado
      // sin intento: pendiente hasta que expire el hold.
      return { result: "rejected", orderId };
    }
    return { result: "pending", orderId };
  }
}
