import type { NotificationService } from "@/src/application/notifications/notification-service";

/** Lo que el barrido necesita del repositorio; el adaptador vive en reminder-repository. */
export interface ReminderRepository {
  /**
   * Reservas confirmadas de cliente que empiezan dentro de las próximas 24 h (y no
   * en las próximas 2, que ya es "ahora"), sin recordatorio, reservadas hace ≥ 12 h
   * (recién reservada, la confirmación ya hizo de recordatorio).
   */
  remindersDue(): Promise<
    { id: string; orderId: string | null; startsAt: string; endsAt: string; customerName: string | null; customerEmail: string | null }[]
  >;
  /** Reclama `reminder_sent_at` solo si estaba en null. true = esta corrida lo marcó. */
  markReminderSent(reservationId: string): Promise<boolean>;
  releaseReminderSent(reservationId: string): Promise<void>;
}

export interface ReminderSweepResult {
  sent: number;
  /** Debidas sin email: no hay a quién mandar. */
  skippedNoEmail: number;
}

/**
 * Recordatorio de sesión (auditoría 2026-09-14, H9). Corre en el mismo pg_cron de
 * 5 minutos que el PIN; mismo patrón: RECLAMAR antes de mandar, SOLTAR si falla.
 * Una ventana ancha (hasta 24 h antes) en vez de "exactamente 24 h": si el cron
 * estuvo caído un rato, la reserva igual recibe su recordatorio en la corrida
 * siguiente, y el correo dice la fecha completa, nunca "mañana".
 */
export class ReminderService {
  constructor(
    private readonly repo: ReminderRepository,
    private readonly notifications: Pick<NotificationService, "notifyReminder">,
  ) {}

  async sweep(): Promise<ReminderSweepResult> {
    let sent = 0;
    let skippedNoEmail = 0;
    for (const r of await this.repo.remindersDue()) {
      if (!r.customerEmail) {
        skippedNoEmail++;
        continue;
      }
      const claimed = await this.repo.markReminderSent(r.id);
      if (!claimed) continue;
      try {
        await this.notifications.notifyReminder({
          email: r.customerEmail,
          name: r.customerName,
          orderId: r.orderId,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
        });
        sent++;
      } catch (e) {
        console.error("[reminders:send]", r.id, e);
        await this.repo.releaseReminderSent(r.id).catch((e2) => console.error("[reminders:release]", r.id, e2));
      }
    }
    return { sent, skippedNoEmail };
  }
}
