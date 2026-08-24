export interface OrderEmailData {
  id: string;
  /**
   * Qué vendió el pedido. Sin esto, `notifyOrder` le manda a un alumno de curso
   * la plantilla de RESERVA con la fecha en "—", porque un pedido de curso no
   * tiene reserva de la cual sacar `startsAt`.
   */
  kind: string;
  email: string | null;
  name: string | null;
  amount: number;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  notifiedAt: string | null;
  lines: { description: string; subtotal: number }[];
}

export interface NotificationRepository {
  getOrderForEmail(orderId: string): Promise<OrderEmailData | null>;
  pendingPaidOrderIds(limit?: number): Promise<string[]>;
  markNotified(orderId: string): Promise<void>;
}
