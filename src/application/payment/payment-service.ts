import type { OrderPaymentRepository } from "@/src/application/ports/orders";
import type { PaymentGateway } from "@/src/application/ports/payment";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface PaymentServiceConfig {
  siteUrl: string;
}

/** Crea la preference de Mercado Pago para un pedido ya creado (post-checkout). */
export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly orders: OrderPaymentRepository,
    private readonly config: PaymentServiceConfig,
  ) {}

  async createPreferenceForOrder(
    orderId: string,
  ): Promise<Result<{ preferenceId: string; initPoint: string }, string>> {
    const order = await this.orders.getOrderForPayment(orderId);
    if (!order) return err("pedido no encontrado");

    const base = this.config.siteUrl.replace(/\/$/, "");
    const back = `${base}/reserva/estado?b=${order.id}`;
    // El checkout vence en 30 min: acota pagos muy tardíos respecto del hold.
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

    try {
      const pref = await this.gateway.createPreference({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: `Reserva FOTF Studios #${order.id.slice(0, 8)}`,
        payerEmail: order.email,
        backUrls: { success: back, failure: back, pending: back },
        notificationUrl: `${base}/api/webhooks/mercadopago`,
        expiresAt,
      });
      await this.orders.recordPreference({
        orderId: order.id,
        provider: "mercadopago",
        preferenceId: pref.preferenceId,
        amount: order.amount,
        currency: order.currency,
      });
      return ok(pref);
    } catch (e) {
      return err(`payment_failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
