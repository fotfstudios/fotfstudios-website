import { WhatsAppSendError, type WhatsAppSender, type WhatsAppTemplate } from "@/src/application/ports/whatsapp";

/** Proxy de Kapso a la Cloud API de Meta. La versión de la Graph API va fija: un cambio es un PR. */
export const KAPSO_API_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

/**
 * Errores de Meta que son transitorios aunque vengan con un 4xx: límite de tasa (130429), límite
 * anti-spam por número (131048), "algo salió mal" (131000), servicio no disponible (131016) y
 * servidor temporalmente caído (133004). El resto de los 4xx es terminal: reintentar una
 * plantilla inexistente (132001) o un número sin WhatsApp (131026) no lo arregla.
 */
const RETRYABLE_META_CODES = new Set([130429, 131000, 131016, 131048, 133004]);

/** Kapso tiene que contestar antes de que el worker se coma su presupuesto de 10 s. */
const TIMEOUT_MS = 8000;

export interface KapsoSenderOptions {
  apiKey: string;
  phoneNumberId: string;
  /**
   * Guarda fuera de producción: si viene, solo se manda a ESE número (el del dueño). Una corrida
   * local o de preview con la llave real nunca le escribe a un cliente.
   */
  onlyTo?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Cuerpo del mensaje de plantilla en el formato de la Cloud API (parámetros CON NOMBRE). */
export function kapsoTemplateBody(to: string, t: WhatsAppTemplate) {
  const params = Object.entries(t.params);
  const components: unknown[] = [];
  if (params.length) {
    components.push({
      type: "body",
      parameters: params.map(([name, text]) => ({ type: "text", parameter_name: name, text })),
    });
  }
  if (t.buttonSuffix) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: t.buttonSuffix }] });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: t.name, language: { code: t.language }, components },
  };
}

/** Adaptador de WhatsApp (Kapso). Único lugar que conoce su API. `fetch` directo, sin SDK. */
export class KapsoWhatsAppSender implements WhatsAppSender {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: KapsoSenderOptions) {
    this.base = (opts.baseUrl ?? KAPSO_API_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async sendTemplate(to: string, t: WhatsAppTemplate): Promise<{ providerId: string }> {
    if (this.opts.onlyTo !== undefined && to !== this.opts.onlyTo) {
      throw new WhatsAppSendError(`bloqueado fuera de producción: solo se manda a OWNER_WHATSAPP (destino ${to})`, null, false);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${encodeURIComponent(this.opts.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { "X-API-Key": this.opts.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(kapsoTemplateBody(to, t)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Red o timeout: no sabemos si Meta lo recibió. Se reintenta igual; el costo de un
      // duplicado poco probable es menor que perder un PIN.
      throw new WhatsAppSendError(`red: ${e instanceof Error ? e.message : String(e)}`, null, true);
    }

    const json = (await res.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number | string; error_data?: { details?: string } };
    } | null;

    if (!res.ok) {
      const metaCode = Number(json?.error?.code);
      const code = Number.isFinite(metaCode) && metaCode > 0 ? metaCode : res.status;
      const detail = json?.error?.error_data?.details;
      const message = `HTTP ${res.status}: ${json?.error?.message ?? res.statusText}${detail ? ` (${detail})` : ""}`;
      const retryable = res.status === 429 || res.status >= 500 || RETRYABLE_META_CODES.has(code);
      throw new WhatsAppSendError(message, code, retryable);
    }

    const providerId = json?.messages?.[0]?.id;
    // Aceptado sin id: no se reintenta (podría duplicar) y queda visible como fallo.
    if (!providerId) throw new WhatsAppSendError("respuesta de Kapso sin id de mensaje", null, false);
    return { providerId };
  }
}

/** Sin credenciales de Kapso: no manda nada, solo deja rastro en el log. */
export class NoopWhatsAppSender implements WhatsAppSender {
  async sendTemplate(to: string, t: WhatsAppTemplate): Promise<{ providerId: string }> {
    console.log(`[whatsapp:noop] ${t.name} → ${to}`);
    return { providerId: `noop.${Date.now()}` };
  }
}
