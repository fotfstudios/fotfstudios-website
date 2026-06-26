/** Puerto de pasarela de pago. Mercado Pago es un adaptador; cambiarlo no toca el dominio. */

export interface PreferenceInput {
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string;
  payerFirstName?: string;
  payerLastName?: string;
  backUrls: { success: string; failure: string; pending: string };
  notificationUrl?: string;
  /** ISO 8601: vence el checkout (acota pagos tardíos respecto del hold). */
  expiresAt?: string;
}

export interface PreferenceResult {
  preferenceId: string;
  initPoint: string; // URL a la que se redirige al cliente
}

export interface PaymentInfo {
  id: string;
  status: string; // approved | pending | rejected | ...
  externalReference?: string;
  amount?: number;
}

export interface PaymentGateway {
  createPreference(input: PreferenceInput): Promise<PreferenceResult>;
  getPayment(paymentId: string): Promise<PaymentInfo>;
  /** Busca el pago de una orden por `external_reference` (reconciliación). */
  findPaymentByOrder(orderId: string): Promise<PaymentInfo | null>;
}
