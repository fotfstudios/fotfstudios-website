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

export interface PaymentRefundInfo {
  id: string;
  amount: number;
  status: string;
  dateCreated?: string;
}

export interface PaymentInfo {
  id: string;
  status: string; // approved | pending | rejected | ...
  externalReference?: string;
  amount?: number;
  // Detalle enriquecido (para snapshot/observabilidad); opcional y best-effort.
  paymentTypeId?: string; // credit_card | debit_card | account_money | ...
  paymentMethodId?: string; // visa | master | ...
  cardLast4?: string;
  installments?: number;
  feeAmount?: number; // comisión MP total
  netReceivedAmount?: number; // neto acreditado al vendedor
  dateApproved?: string;
  payerEmail?: string;
  payerName?: string;
  refunds?: PaymentRefundInfo[];
}

export interface RefundResult {
  id: string;
  status: string; // approved | in_process | ...
  amount?: number;
}

export interface PaymentGateway {
  createPreference(input: PreferenceInput): Promise<PreferenceResult>;
  getPayment(paymentId: string): Promise<PaymentInfo>;
  /** Busca el pago de una orden por `external_reference` (reconciliación). */
  findPaymentByOrder(orderId: string): Promise<PaymentInfo | null>;
  /** Reembolsa un pago. Sin `amount` → total; con `amount` → parcial. */
  refundPayment(paymentId: string, amount?: number): Promise<RefundResult>;
  /**
   * Anula un pago aún no aprobado (MP "Create cancellation":
   * `PUT /v1/payments/{id}` `{status:"cancelled"}`). Solo válido si el pago está
   * `pending`/`in_process`; MP rechaza anular un pago ya aprobado.
   */
  cancelPayment(paymentId: string): Promise<{ id: string; status: string }>;
}
