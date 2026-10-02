import type { NotificationService } from "@/src/application/notifications/notification-service";
import { manualHoldFreesAt } from "@/src/domain/scheduling/manual-hold-deadline";

/** Lo que el barrido necesita del repositorio; el adaptador vive en payment-reminder-repository. */
export interface PaymentReminderRepository {
  /**
   * Reservas manuales pendientes de pago (hold firme) cuyo reloj de 72 h empezó hace
   * ≥ 48 h, sin recordatorio. Mismo predicado que el barrido que las libera.
   */
  due(): Promise<{ orderId: string; clockStart: string; customerEmail: string | null }[]>;
  /** Reclama `payment_reminder_sent_at` solo si estaba en null. true = esta corrida lo marcó. */
  markSent(orderId: string): Promise<boolean>;
  releaseSent(orderId: string): Promise<void>;
}

export interface PaymentReminderSweepResult {
  sent: number;
  /** Debidas sin email: no hay a quién mandar. */
  skippedNoEmail: number;
}

/**
 * Recordatorio de pago de una reserva manual pendiente: UNO, a ~24 h de que el barrido
 * diario la libere. Corre en el pg_cron de 5 min junto al PIN y al recordatorio de
 * sesión; mismo patrón: RECLAMAR antes de mandar, SOLTAR si falla. El correo dice la
 * hora real de liberación (manualHoldFreesAt), calculada en el momento de mandar: si
 * el cron estuvo caído, nunca promete una hora que ya pasó.
 */
export class PaymentReminderService {
  constructor(
    private readonly repo: PaymentReminderRepository,
    private readonly notifications: Pick<NotificationService, "notifyPaymentReminder">,
  ) {}

  async sweep(now: Date = new Date()): Promise<PaymentReminderSweepResult> {
    let sent = 0;
    let skippedNoEmail = 0;
    for (const r of await this.repo.due()) {
      if (!r.customerEmail) {
        skippedNoEmail++;
        continue;
      }
      if (!(await this.repo.markSent(r.orderId))) continue;
      try {
        const ok = await this.notifications.notifyPaymentReminder(r.orderId, {
          freesAt: manualHoldFreesAt(r.clockStart, now).toISOString(),
        });
        if (!ok) throw new Error("sin destinatario");
        sent++;
      } catch (e) {
        console.error("[payment-reminders:send]", r.orderId, e);
        await this.repo.releaseSent(r.orderId).catch((e2) => console.error("[payment-reminders:release]", r.orderId, e2));
      }
    }
    return { sent, skippedNoEmail };
  }
}
