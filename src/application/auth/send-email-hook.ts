import { Webhook } from "standardwebhooks";
import type { Mailer } from "@/src/application/ports/mailer";
import { authEmailsFor, type SendEmailHookPayload } from "./auth-email";

export interface HookResponse {
  status: 200 | 401 | 500 | 503;
  body: Record<string, unknown>;
}

/**
 * Send Email Hook de Supabase Auth: GoTrue nos pide el correo (código de inicio de
 * sesión, recuperación, cambio de correo) y lo mandamos por el mismo `Mailer` que
 * todo lo demás — bitácora, tags y plantillas versionadas incluidas.
 *
 * Firma: Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`),
 * secreto `v1,whsec_<base64>`; varios separados por `|` para rotar sin corte. Sin
 * secreto configurado el endpoint queda cerrado (503), como los crons.
 *
 * Un fallo del proveedor responde 500 con el formato de error del hook: Auth le
 * devuelve el error al cliente (mejor "no pudimos mandar el código" que un formulario
 * que dice "revisa tu correo" sobre un correo que nunca salió).
 */
export class SendEmailHookService {
  private readonly verifiers: Webhook[];

  constructor(private readonly cfg: { secrets: string; mailer: Mailer; supabaseUrl: string }) {
    this.verifiers = cfg.secrets
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new Webhook(s.replace(/^v1,whsec_/, "")));
  }

  async handle(rawBody: string, headers: Record<string, string | null | undefined>): Promise<HookResponse> {
    if (this.verifiers.length === 0) return { status: 503, body: { error: { http_code: 503, message: "hook no configurado" } } };

    const h = {
      "webhook-id": headers["webhook-id"] ?? "",
      "webhook-timestamp": headers["webhook-timestamp"] ?? "",
      "webhook-signature": headers["webhook-signature"] ?? "",
    };
    let payload: SendEmailHookPayload | null = null;
    for (const wh of this.verifiers) {
      try {
        payload = wh.verify(rawBody, h) as SendEmailHookPayload;
        break;
      } catch {
        // probar el siguiente secreto (rotación)
      }
    }
    if (!payload) return { status: 401, body: { error: { http_code: 401, message: "firma inválida" } } };

    const emails = authEmailsFor(payload, { supabaseUrl: this.cfg.supabaseUrl });
    try {
      for (const m of emails) await this.cfg.mailer.send(m);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[auth-hook:send]", payload.email_data.email_action_type, message);
      return { status: 500, body: { error: { http_code: 500, message: `no se pudo enviar el correo: ${message}` } } };
    }
    return { status: 200, body: {} };
  }
}
