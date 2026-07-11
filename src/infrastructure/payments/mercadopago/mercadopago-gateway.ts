import { MercadoPagoConfig, Payment, PaymentRefund, Preference } from "mercadopago";
import type {
  PaymentGateway,
  PaymentInfo,
  PaymentRefundInfo,
  PreferenceInput,
  PreferenceResult,
  RefundResult,
} from "@/src/application/ports/payment";

/** Forma cruda de un reembolso en el SDK de MP (embebido en el pago, o de list/get). */
type RawRefund = {
  id?: number | string | null;
  amount?: number | null;
  status?: string | null;
  date_created?: string | null;
};

/** Mapea un reembolso crudo de MP a nuestro `PaymentRefundInfo`. Único punto de mapeo. */
export function toRefundInfo(r: RawRefund): PaymentRefundInfo {
  return {
    id: String(r.id),
    amount: r.amount ?? 0,
    status: r.status ?? "unknown",
    dateCreated: r.date_created ?? undefined,
  };
}

/** Adaptador de Mercado Pago (Checkout Pro). Único lugar que conoce el SDK de MP. */
export class MercadoPagoGateway implements PaymentGateway {
  private readonly client: MercadoPagoConfig;

  constructor(accessToken: string) {
    this.client = new MercadoPagoConfig({ accessToken });
  }

  async createPreference(input: PreferenceInput): Promise<PreferenceResult> {
    const pref = new Preference(this.client);
    // MP rechaza auto_return con URLs no-https (p.ej. localhost en dev).
    const httpsBackUrls = input.backUrls.success.startsWith("https://");
    const res = await pref.create({
      body: {
        items: [
          {
            id: input.orderId,
            title: input.description,
            // Descripción del item: mejora la validación antifraude (más aprobación).
            description: input.description,
            category_id: "services",
            quantity: 1,
            unit_price: input.amount,
            currency_id: input.currency,
          },
        ],
        external_reference: input.orderId,
        // Metadata para correlacionar la transacción con la reserva desde el lado de MP.
        metadata: { order_id: input.orderId, customer_email: input.payerEmail },
        // Cuanto más completo el payer, mejor la tasa de aprobación de MP.
        payer:
          input.payerEmail || input.payerFirstName
            ? {
                email: input.payerEmail,
                // En Checkout Pro el payer usa name/surname (no first_name/last_name).
                name: input.payerFirstName,
                surname: input.payerLastName,
              }
            : undefined,
        back_urls: input.backUrls,
        auto_return: httpsBackUrls ? "approved" : undefined,
        notification_url: input.notificationUrl,
        // Aparece en la cartola de la tarjeta del cliente (baja contracargos).
        statement_descriptor: "FOTF STUDIOS",
        // Aprobación instantánea: el pago no queda "in_process"/"pending".
        binary_mode: true,
        // Vence el checkout para acotar pagos tardíos respecto del hold.
        ...(input.expiresAt ? { expires: true, expiration_date_to: input.expiresAt } : {}),
        // Corte 1: solo medios instantáneos (excluir cupón/efectivo y cajero),
        // para que el pago no quede "pending" más allá del hold de 10 min.
        payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
      },
      // Idempotencia: reintentos no crean preferences duplicadas.
      requestOptions: { idempotencyKey: input.orderId },
    });

    const initPoint = res.init_point ?? res.sandbox_init_point;
    if (!res.id || !initPoint) throw new Error("Mercado Pago no devolvió id/init_point");
    return { preferenceId: res.id, initPoint };
  }

  async getPayment(paymentId: string): Promise<PaymentInfo> {
    const payment = new Payment(this.client);
    const p = await payment.get({ id: paymentId });
    const fee = (p.fee_details ?? []).reduce((sum, f) => sum + (f.amount ?? 0), 0);
    const payerName = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ") || undefined;
    return {
      id: String(p.id),
      status: p.status ?? "unknown",
      externalReference: p.external_reference ?? undefined,
      amount: p.transaction_amount ?? undefined,
      paymentTypeId: p.payment_type_id ?? undefined,
      paymentMethodId: p.payment_method_id ?? undefined,
      cardLast4: p.card?.last_four_digits ?? undefined,
      installments: p.installments ?? undefined,
      feeAmount: fee > 0 ? fee : undefined,
      netReceivedAmount: p.transaction_details?.net_received_amount ?? undefined,
      dateApproved: p.date_approved ?? undefined,
      payerEmail: p.payer?.email ?? undefined,
      payerName,
      refunds: (p.refunds ?? []).map(toRefundInfo),
    };
  }

  async listRefunds(paymentId: string): Promise<PaymentRefundInfo[]> {
    const refunds = new PaymentRefund(this.client);
    try {
      const res = await refunds.list({ payment_id: paymentId });
      return (Array.isArray(res) ? res : []).map(toRefundInfo);
    } catch (e) {
      throw new Error(`No se pudieron listar los reembolsos en Mercado Pago: ${mpErrorMessage(e)}`);
    }
  }

  async getRefund(paymentId: string, refundId: string): Promise<PaymentRefundInfo | null> {
    const refunds = new PaymentRefund(this.client);
    try {
      const r = await refunds.get({ payment_id: paymentId, refund_id: refundId });
      return r?.id ? toRefundInfo(r) : null;
    } catch (e) {
      throw new Error(`No se pudo obtener el reembolso en Mercado Pago: ${mpErrorMessage(e)}`);
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<RefundResult> {
    const refunds = new PaymentRefund(this.client);
    let r;
    try {
      // Idempotencia: reintentos no generan reembolsos duplicados.
      r =
        amount == null
          ? await refunds.total({
              payment_id: paymentId,
              requestOptions: { idempotencyKey: `refund:${paymentId}` },
            })
          : await refunds.create({
              payment_id: paymentId,
              body: { amount },
              requestOptions: { idempotencyKey: `refund:${paymentId}:${amount}` },
            });
    } catch (e) {
      // El SDK de MP puede lanzar un objeto (no Error) con la respuesta de la API;
      // extraemos el mensaje para que la acción muestre la causa real, no genérico.
      throw new Error(`No se pudo reembolsar en Mercado Pago: ${mpErrorMessage(e)}`);
    }
    if (!r.id) throw new Error("Mercado Pago no devolvió id de reembolso");
    return { id: String(r.id), status: r.status ?? "unknown", amount: r.amount ?? undefined };
  }

  async cancelPayment(paymentId: string): Promise<{ id: string; status: string }> {
    const payment = new Payment(this.client);
    let p;
    try {
      // PUT /v1/payments/{id} {status:"cancelled"} — solo pending/in_process.
      p = await payment.cancel({ id: paymentId });
    } catch (e) {
      throw new Error(`No se pudo anular el pago en Mercado Pago: ${mpErrorMessage(e)}`);
    }
    return { id: String(p.id), status: p.status ?? "unknown" };
  }

  async findPaymentByOrder(orderId: string): Promise<PaymentInfo | null> {
    const payment = new Payment(this.client);
    const res = await payment.search({ options: { external_reference: orderId } });
    const results = (res.results ?? []) as Array<{
      id?: number | string;
      status?: string;
      external_reference?: string;
      transaction_amount?: number;
    }>;
    // Preferir un pago aprobado; si no, el más reciente disponible.
    const p = results.find((r) => r.status === "approved") ?? results[0];
    if (!p?.id) return null;
    return {
      id: String(p.id),
      status: p.status ?? "unknown",
      externalReference: p.external_reference ?? undefined,
      amount: p.transaction_amount ?? undefined,
    };
  }
}

/** Mensaje legible del error del SDK de MP (que a veces lanza un objeto, no un Error). */
function mpErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; cause?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (Array.isArray(o.cause) && o.cause[0] && typeof o.cause[0] === "object") {
      const c = o.cause[0] as { description?: unknown };
      if (typeof c.description === "string") return c.description;
    }
  }
  return "error desconocido";
}
