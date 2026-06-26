import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

export type WebhookResult = "paid" | "cancelled" | "pending" | "duplicate" | "ignored";

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

    const fresh = await this.repo.recordEvent(`${paymentId}:${payment.status}`, "payment", payment);
    if (!fresh) return "duplicate";

    if (!payment.externalReference) return "ignored";

    if (payment.status === "approved") {
      await this.repo.confirmPaid(payment.externalReference, paymentId);
      return "paid";
    }
    if (payment.status === "rejected" || payment.status === "cancelled") {
      await this.repo.cancelUnpaid(payment.externalReference);
      return "cancelled";
    }
    return "pending";
  }
}
