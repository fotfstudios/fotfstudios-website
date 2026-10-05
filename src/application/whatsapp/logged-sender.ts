import type { NotificationLogRepository } from "@/src/application/ports/notification-log";
import type { WhatsAppSender, WhatsAppTemplate } from "@/src/application/ports/whatsapp";

/**
 * Decorador: manda con el sender real y deja constancia del intento en `notification_log` con
 * `channel = 'whatsapp'`, como LoggedMailer con el correo. Hermano y no generalización: un correo y
 * una plantilla de WhatsApp no comparten forma. Un fallo del proveedor se registra Y se propaga (la
 * cola decide si reintenta); un fallo de la bitácora nunca tapa al envío.
 *
 * Registra la ACEPTACIÓN de Kapso. Que el mensaje llegue (o no: número sin WhatsApp, fuera de
 * ventana) lo informa después el webhook de estado y se ve en /admin/whatsapp.
 */
export class LoggedWhatsAppSender implements WhatsAppSender {
  constructor(
    private readonly inner: WhatsAppSender,
    private readonly log: NotificationLogRepository,
  ) {}

  async sendTemplate(to: string, t: WhatsAppTemplate): Promise<{ providerId: string }> {
    const base = { template: t.name, recipient: to, subject: `WhatsApp · ${t.name}`, channel: "whatsapp" as const };
    let out: { providerId: string };
    try {
      out = await this.inner.sendTemplate(to, t);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.log.record({ ...base, ok: false, error }).catch((e2) => console.error("[whatsapp:log]", e2));
      throw e;
    }
    await this.log.record({ ...base, ok: true, error: null }).catch((e2) => console.error("[whatsapp:log]", e2));
    return out;
  }
}
