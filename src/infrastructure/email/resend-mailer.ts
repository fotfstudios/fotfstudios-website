import { Resend } from "resend";
import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";

/** Adaptador de email (Resend). Único lugar que conoce el SDK. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
    /** Buzón que el dueño realmente lee; sin esto las respuestas caen en `from`. */
    private readonly replyTo?: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(msg: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: msg.to,
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      // Etiqueta por plantilla: en el panel de Resend se ve qué correo rebota o se demora.
      // Resend solo acepta [A-Za-z0-9_-] y rechaza el ENVÍO si no: la clave de bitácora
      // `guideDelivery:<slug>` queda intacta en notification_log, solo el tag se sanea.
      tags: [{ name: "template", value: msg.template.replace(/[^A-Za-z0-9_-]/g, "_") }],
      ...(msg.attachments ? { attachments: msg.attachments } : {}),
    });
    if (error) throw new Error(error.message);
  }
}

/** Fallback sin envío real (dev / cuando no hay RESEND_API_KEY). */
export class NoopMailer implements Mailer {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[email:noop] ${msg.subject} → ${msg.to}`);
  }
}
