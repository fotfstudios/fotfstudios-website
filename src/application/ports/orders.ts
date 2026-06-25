/** Lectura/escritura de pedidos para el flujo de pago. */

export interface OrderForPayment {
  id: string;
  amount: number;
  currency: string;
  email?: string;
}

export interface RecordPreferenceParams {
  orderId: string;
  provider: string;
  preferenceId: string;
  amount: number;
  currency: string;
}

export interface OrderPaymentRepository {
  getOrderForPayment(orderId: string): Promise<OrderForPayment | null>;
  recordPreference(p: RecordPreferenceParams): Promise<void>;
}
