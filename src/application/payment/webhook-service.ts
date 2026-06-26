import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

export type WebhookOutcome =
  | "paid"
  | "paid_unreserved"
  | "cancelled"
  | "pending"
  | "duplicate"
  | "ignored";

export interface WebhookResult {
  result: WebhookOutcome;
  orderId: string | null;
}

/**
 * Procesa una notificación de pago de Mercado Pago. El estado se obtiene de la
 * API de MP (fuente de verdad), no del body. Idempotente vía inbox por
 * (paymentId:status): cada transición se procesa una sola vez.
 */
export class WebhookService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repo: PaymentNotificationRepository,
  ) {}

  async handlePaymentNotification(paymentId: string): Promise<WebhookResult> {
    const payment = await this.gateway.getPayment(paymentId);
    const orderId = payment.externalReference ?? null;

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
      const status = await this.repo.confirmPaid(orderId, paymentId);
      // `paid_no_hold`: pagó pero la reserva ya no estaba en hold → revisión del dueño.
      return { result: status === "paid_no_hold" ? "paid_unreserved" : "paid", orderId };
    }
    if (payment.status === "rejected" || payment.status === "cancelled") {
      await this.repo.cancelUnpaid(orderId);
      return { result: "cancelled", orderId };
    }
    return { result: "pending", orderId };
  }
}
