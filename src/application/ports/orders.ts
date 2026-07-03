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

/** Vista de confirmación para la página post-pago. SIN email/teléfono (privacidad). */
export interface OrderConfirmation {
  orderId: string;
  orderStatus: "cart" | "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded";
  customerName: string | null;
  /** ISO; null si la orden nunca tuvo reserva (cancelada antes del hold / pago tardío). */
  startsAt: string | null;
  endsAt: string | null;
  resourceName: string | null;
  reservationStatus: "held" | "confirmed" | "cancelled" | "expired" | null;
  /** Preference de MP (orders.mp_preference_id) — permite retomar un checkout abandonado. */
  preferenceId: string | null;
  lines: { description: string; subtotal: number }[];
  total: number;
  currency: string;
}

/** Lectura segregada para la página de confirmación (no ensancha el repo de pagos). */
export interface OrderConfirmationReader {
  getOrderConfirmation(orderId: string): Promise<OrderConfirmation | null>;
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
