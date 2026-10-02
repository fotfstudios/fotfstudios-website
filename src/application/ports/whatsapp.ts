import type { WaEvent } from "@/src/application/whatsapp/templates";

/**
 * Mensaje de plantilla de WhatsApp listo para mandar. La plantilla (texto, botón) vive en Meta;
 * acá solo viaja su nombre y los valores de sus parámetros con nombre.
 */
export interface WhatsAppTemplate {
  /** Nombre aprobado en Meta (`fotf_reserva_confirmada`, …). */
  name: string;
  language: "es";
  /** Parámetros con nombre del cuerpo: `{ nombre: "Ana", fecha: "…" }`. */
  params: Record<string, string>;
  /** Sufijo del botón de URL dinámica (`{{1}}` al final de la URL), si la plantilla lo tiene. */
  buttonSuffix?: string;
}

/**
 * Falla de envío. `retryable` decide si la cola reintenta (429, 5xx, red) o deja la fila
 * `failed` (plantilla inexistente, número inválido, parámetros que no calzan…).
 */
export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    /** Código de error de Meta/Kapso (131026, 132001, …) o el HTTP status si no vino uno. */
    readonly code: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

export interface WhatsAppSender {
  /** `to` en dígitos E.164 sin `+` (`56912345678`). Devuelve el wamid que asignó Meta. */
  sendTemplate(to: string, template: WhatsAppTemplate): Promise<{ providerId: string }>;
}

/** Un aviso a encolar. La cola lo manda después (pg_cron cada minuto) y nunca después de `expiresAt`. */
export interface WhatsAppOutboxEntry {
  event: WaEvent;
  to: string;
  template: WhatsAppTemplate;
  /** Idempotencia del encolado: el mismo aviso para la misma entidad entra una sola vez. */
  dedupeKey: string;
  expiresAt: string;
  entity?: { kind: "order" | "reservation"; id: string };
}

export interface WhatsAppOutbox {
  /** Inserta la fila; si la `dedupeKey` ya existe no hace nada (no es error). */
  enqueue(entry: WhatsAppOutboxEntry): Promise<void>;
}
