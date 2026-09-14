import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";
import type { NotificationLogRepository } from "@/src/application/ports/notification-log";

/**
 * Decorador: manda con el mailer real y deja constancia del intento en la bitácora.
 * Un fallo del proveedor se registra Y se propaga (el call site decide si es fatal);
 * un fallo de la bitácora nunca tapa al envío: se loguea y sigue.
 */
export class LoggedMailer implements Mailer {
  constructor(
    private readonly inner: Mailer,
    private readonly log: NotificationLogRepository,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const base = { template: msg.template, recipient: msg.to, subject: msg.subject };
    try {
      await this.inner.send(msg);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.log.record({ ...base, ok: false, error }).catch((e2) => console.error("[email:log]", e2));
      throw e;
    }
    await this.log.record({ ...base, ok: true, error: null }).catch((e2) => console.error("[email:log]", e2));
  }
}
