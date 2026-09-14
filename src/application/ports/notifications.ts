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
  /**
   * Reclama la notificación: pone `notified_at` SOLO si estaba en null. `true` = esta
   * llamada la marcó; `false` = otra corrida (cron, webhook, sondeo) ya la reclamó.
   * Se llama ANTES de mandar, como `markAccessSent` en el PIN.
   */
  markNotified(orderId: string): Promise<boolean>;
  /** Suelta el reclamo (vuelve `notified_at` a null) cuando el envío al cliente falló. */
  releaseNotified(orderId: string): Promise<void>;
}
