import { Resend } from "resend";
import type { EmailMessage, Mailer } from "@/src/application/ports/mailer";

/** Adaptador de email (Resend). Único lugar que conoce el SDK. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(msg: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? "",
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
