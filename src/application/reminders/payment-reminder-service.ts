import type { NotificationService } from "@/src/application/notifications/notification-service";
import { manualHoldDeadline } from "@/src/domain/scheduling/manual-hold-deadline";

/** El recordatorio sale cuando quedan ≤ 24 h para el plazo de pago. */
export const PAYMENT_REMINDER_LEAD_HOURS = 24;

/** Lo que el barrido necesita del repositorio; el adaptador vive en payment-reminder-repository. */
export interface PaymentReminderRepository {
  /**
   * Candidatas: reservas manuales pendientes de pago (hold firme, mismo universo que el
   * barrido que las libera) sin recordatorio, con reloj de ≥ 12 h y sesión aún no
   * iniciada. Es un pre-filtro: si toca mandar o no lo decide el servicio.
   */
  due(): Promise<{ orderId: string; clockStart: string; startsAt: string; customerEmail: string | null }[]>;
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
 * Recordatorio de pago de una reserva manual pendiente: UNO, cuando quedan ≤ 24 h para
 * el plazo (manualHoldDeadline: lo primero entre el barrido que libera las 72 h y el
 * inicio de la sesión). Corre en el pg_cron de 5 min junto al PIN y al recordatorio de
 * sesión; mismo patrón: RECLAMAR antes de mandar, SOLTAR si falla. Una reserva creada
 * con menos de ~12 h de margen no recibe recordatorio: el aviso de creación ya dice el
 * plazo (el repositorio exige reloj de ≥ 12 h).
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
      const left = manualHoldDeadline(r.clockStart, r.startsAt, now).getTime() - now.getTime();
      if (left <= 0 || left > PAYMENT_REMINDER_LEAD_HOURS * 3600_000) continue;
      if (!r.customerEmail) {
        skippedNoEmail++;
        continue;
      }
      if (!(await this.repo.markSent(r.orderId))) continue;
      try {
        const ok = await this.notifications.notifyPaymentReminder(r.orderId, { clockStart: r.clockStart, now });
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
