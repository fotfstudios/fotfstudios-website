import type { NotificationService } from "@/src/application/notifications/notification-service";

/** Lo que el barrido necesita del repositorio; el adaptador vive en reminder-repository. */
export interface ReminderRepository {
  /**
   * Reservas confirmadas de cliente que empiezan dentro de las próximas 24 h (y no
   * en las próximas 2, que ya es "ahora"), sin recordatorio, reservadas hace ≥ 12 h
   * (recién reservada, la confirmación ya hizo de recordatorio).
   */
  remindersDue(): Promise<
    {
      id: string;
      orderId: string | null;
      startsAt: string;
      endsAt: string;
      customerName: string | null;
      customerEmail: string | null;
      /** Sesión guiada del curso (kind=curso); null para una reserva de sala o práctica. */
      course: { n: number; title: string; instructor: string | null } | null;
      /** La prueba del curso lleva su propio recordatorio (guiada: sin PIN). */
      trial?: boolean;
      /** Para el WhatsApp (celular de la ficha y su consentimiento). */
      phone?: string | null;
      whatsappOptIn?: boolean;
    }[]
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
    private readonly notifications: Pick<NotificationService, "notifyReminder" | "notifyCourseSessionReminder" | "notifyTrialReminder">,
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
        if (r.trial) {
          // Sin plantilla de WhatsApp para la prueba: solo correo (como la sesión guiada).
          await this.notifications.notifyTrialReminder({
            email: r.customerEmail,
            name: r.customerName,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
          });
        } else if (r.course) {
          // Sin plantilla de WhatsApp para la sesión guiada: solo correo.
          await this.notifications.notifyCourseSessionReminder({
            email: r.customerEmail,
            name: r.customerName,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            ...r.course,
          });
        } else {
          await this.notifications.notifyReminder({
            email: r.customerEmail,
            name: r.customerName,
            orderId: r.orderId,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            reservationId: r.id,
            phone: r.phone ?? null,
            whatsappOptIn: r.whatsappOptIn ?? false,
          });
        }
        sent++;
      } catch (e) {
        console.error("[reminders:send]", r.id, e);
        await this.repo.releaseReminderSent(r.id).catch((e2) => console.error("[reminders:release]", r.id, e2));
      }
    }
    return { sent, skippedNoEmail };
  }
}
