import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import type {
  PaymentGateway,
  PaymentInfo,
  PreferenceInput,
  PreferenceResult,
} from "@/src/application/ports/payment";

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
            quantity: 1,
            unit_price: input.amount,
            currency_id: input.currency,
          },
        ],
        external_reference: input.orderId,
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        back_urls: input.backUrls,
        auto_return: httpsBackUrls ? "approved" : undefined,
        notification_url: input.notificationUrl,
        // Corte 1: solo medios instantáneos (excluir cupón/efectivo y cajero),
        // para que el pago no quede "pending" más allá del hold de 10 min.
        payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
      },
    });

    const initPoint = res.init_point ?? res.sandbox_init_point;
    if (!res.id || !initPoint) throw new Error("Mercado Pago no devolvió id/init_point");
    return { preferenceId: res.id, initPoint };
  }

  async getPayment(paymentId: string): Promise<PaymentInfo> {
    const payment = new Payment(this.client);
    const p = await payment.get({ id: paymentId });
    return {
      id: String(p.id),
      status: p.status ?? "unknown",
      externalReference: p.external_reference ?? undefined,
      amount: p.transaction_amount ?? undefined,
    };
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
