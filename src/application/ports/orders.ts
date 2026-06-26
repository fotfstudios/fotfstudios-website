/** Lectura/escritura de pedidos para el flujo de pago. */

export interface OrderForPayment {
  id: string;
  amount: number;
  currency: string;
  email?: string;
  /** Nombre del cliente (para payer.first_name/last_name → mejor aprobación MP). */
  name?: string;
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
  /**
   * IDs de pedidos aún `pending_payment` en una ventana [olderThanMin, withinHours]
   * para el barrido de reconciliación de fondo (A1). Excluye los muy recientes para
   * no competir con un checkout en curso.
   */
  pendingOrderIds(opts: { olderThanMinutes: number; withinHours: number; limit?: number }): Promise<string[]>;
}
