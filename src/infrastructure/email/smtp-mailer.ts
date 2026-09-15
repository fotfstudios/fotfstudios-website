import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";

/**
 * Adaptador de email por SMTP. Existe para el stack LOCAL: apunta al Mailpit de Supabase
 * (`SMTP_URL=smtp://127.0.0.1:54325`) y así cada correo —los de Auth vía el Send Email
 * Hook y los transaccionales— sale por las mismas plantillas que en prod, queda en
 * `notification_log` (LoggedMailer) y además se puede leer y clickear en
 * http://127.0.0.1:54424. En prod nunca se usa: ahí manda Resend.
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  constructor(
    url: string,
    private readonly from: string,
    /** Buzón que el dueño realmente lee; sin esto las respuestas caen en `from`. */
    private readonly replyTo?: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.attachments ? { attachments: msg.attachments } : {}),
    });
  }
}
