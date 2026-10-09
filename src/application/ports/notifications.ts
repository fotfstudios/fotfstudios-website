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
  /** `orders.payment_method` (null hasta pagar). */
  paymentMethod: string | null;
  lines: { description: string; subtotal: number }[];
  /** Reserva del pedido (link del panel en las alertas al dueño); null si no tiene. */
  reservationId?: string | null;
  /** Celular para WhatsApp: el de la ficha, o el del pedido si la ficha no tiene. */
  phone?: string | null;
  /** Consentimiento de WhatsApp de la ficha del pedido (false o ausente sin ficha). */
  whatsappOptIn?: boolean;
}

/** Contacto vigente de una reserva SIN pedido (práctica, cortesía): horario + ficha. */
export interface ReservationContact {
  reservationId: string;
  name: string | null;
  email: string | null;
  /** Celular para WhatsApp: el de la ficha, o el de la reserva si la ficha no tiene. */
  phone: string | null;
  /** Consentimiento de WhatsApp de la ficha (false sin ficha). */
  whatsappOptIn: boolean;
  startsAt: string;
  endsAt: string;
}

export interface NotificationRepository {
  getOrderForEmail(orderId: string): Promise<OrderEmailData | null>;
  getReservationContact(reservationId: string): Promise<ReservationContact | null>;
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
