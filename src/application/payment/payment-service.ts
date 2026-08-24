import type { OrderPaymentRepository } from "@/src/application/ports/orders";
import type { PaymentGateway } from "@/src/application/ports/payment";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface PaymentServiceConfig {
  siteUrl: string;
  /**
   * `notification_url` por-preference (opt-in, normalmente AUSENTE). Las URLs
   * configuradas al crear el pago tienen prioridad sobre las del panel
   * ("Tus integraciones") y MP las notifica como IPN legacy (`?id=&topic=`),
   * cuya x-signature NO se puede validar con la clave secreta. Sin este campo,
   * MP entrega por los Webhooks del panel (`?data.id=&type=`), con firma
   * validable. Solo para dev (túnel alternativo); ver MP_NOTIFICATION_URL.
   */
  notificationUrl?: string;
}

/** TTL del hold de reserva (debe coincidir con `p_ttl` en create_checkout/create_hold). */
const HOLD_TTL_MINUTES = 10;

/** Crea la preference de Mercado Pago para un pedido ya creado (post-checkout). */
export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly orders: OrderPaymentRepository,
    private readonly config: PaymentServiceConfig,
  ) {}

  async createPreferenceForOrder(
    orderId: string,
    opts?: {
      expiresInMinutes?: number | null;
      /** Texto que ve el pagador en MP. Por defecto habla de una reserva. */
      description?: string;
      /**
       * Ruta de retorno. Por defecto /reserva/estado, que está detrás de
       * `bookingEnabled()` y espera una reserva: un pedido de curso necesita la
       * suya o el comprador vuelve a un 404.
       */
      backPath?: string;
    },
  ): Promise<Result<{ preferenceId: string; initPoint: string }, string>> {
    const order = await this.orders.getOrderForPayment(orderId);
    if (!order) return err("pedido no encontrado");

    const base = this.config.siteUrl.replace(/\/$/, "");
    const path = opts?.backPath ?? "/reserva/estado";
    const back = `${base}${path}?b=${order.id}`;
    // El checkout vence junto con el hold (10 min). Alinearlos evita que un pago
    // llegue cuando el horario ya se liberó/revendió. El borde restante lo cubre
    // confirm_payment (estado `paid_no_hold` → revisión, sin confirmar al cliente).
    // El cobro de reagendamiento pasa una ventana más larga o `null` (no hay hold
    // que alinear; el cliente ausente paga cuando puede).
    const minutes = opts?.expiresInMinutes === undefined ? HOLD_TTL_MINUTES : opts.expiresInMinutes;
    const expiresAt = minutes == null ? undefined : new Date(Date.now() + minutes * 60_000).toISOString();
    // payer.first_name/last_name a partir del nombre del cliente (mejor aprobación MP).
    const [firstName, ...rest] = (order.name ?? "").trim().split(/\s+/).filter(Boolean);
    const lastName = rest.join(" ") || undefined;

    try {
      const pref = await this.gateway.createPreference({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        description: opts?.description ?? `Reserva FOTF Studios #${order.id.slice(0, 8)}`,
        payerEmail: order.email,
        payerFirstName: firstName,
        payerLastName: lastName,
        backUrls: { success: back, failure: back, pending: back },
        notificationUrl: this.config.notificationUrl,
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
