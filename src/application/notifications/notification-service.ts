import { DateTime } from "luxon";
import type { Mailer } from "@/src/application/ports/mailer";
import type { NotificationRepository } from "@/src/application/ports/notifications";
import { formatCLP } from "@/src/domain/money/money";
import { customerConfirmation, ownerNeedsReview, ownerNotification } from "./templates";

export interface NotificationConfig {
  ownerEmail: string;
  tz: string;
  address: string;
  whatsappUrl: string;
}

/** Envía emails de confirmación (cliente + dueño) al pagarse una reserva. */
export class NotificationService {
  constructor(
    private readonly mailer: Mailer,
    private readonly repo: NotificationRepository,
    private readonly config: NotificationConfig,
  ) {}

  async notifyOrder(orderId: string): Promise<boolean> {
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o || o.notifiedAt) return false;

    const when = o.startsAt
      ? DateTime.fromISO(o.startsAt).setZone(this.config.tz).setLocale("es").toFormat("cccc d 'de' LLLL, HH:mm 'h'")
      : "—";
    const view = {
      name: o.name,
      when,
      total: formatCLP(o.amount),
      lines: o.lines.map((l) => ({ description: l.description, amount: formatCLP(l.subtotal) })),
    };

    if (o.email) {
      await this.mailer.send({
        to: o.email,
        ...customerConfirmation(view, { address: this.config.address, whatsappUrl: this.config.whatsappUrl }),
      });
    }
    if (this.config.ownerEmail) {
      await this.mailer.send({ to: this.config.ownerEmail, ...ownerNotification({ ...view, email: o.email }) });
    }

    await this.repo.markNotified(orderId);
    return true;
  }

  /**
   * Alerta al dueño cuando un pago se aprobó sin reserva válida (`paid_no_hold`).
   * No escribe al cliente: `confirm_payment` ya marcó `notified_at` para suprimir la
   * confirmación normal. Best-effort; el dueño igual lo ve en el panel/boleta.
   */
  async notifyPaymentNeedsReview(orderId: string, paymentId: string): Promise<void> {
    if (!this.config.ownerEmail) return;
    const o = await this.repo.getOrderForEmail(orderId);
    if (!o) return;
    const when = o.startsAt
      ? DateTime.fromISO(o.startsAt).setZone(this.config.tz).setLocale("es").toFormat("cccc d 'de' LLLL, HH:mm 'h'")
      : "—";
    await this.mailer.send({
      to: this.config.ownerEmail,
      ...ownerNeedsReview({ when, total: formatCLP(o.amount), email: o.email, paymentId }),
    });
  }

  async notifyPending(): Promise<number> {
    const ids = await this.repo.pendingPaidOrderIds();
    let n = 0;
    for (const id of ids) {
      if (await this.notifyOrder(id)) n++;
    }
    return n;
  }
}
