import type { WhatsAppDeliveryStatus } from "@/src/infrastructure/db/whatsapp-outbox-repository";

export interface KapsoStatusEvent {
  providerId: string;
  status: WhatsAppDeliveryStatus;
  code: number | null;
  message: string | null;
}

const STATUS_EVENTS: Record<string, WhatsAppDeliveryStatus> = {
  "whatsapp.message.sent": "sent",
  "whatsapp.message.delivered": "delivered",
  "whatsapp.message.read": "read",
  "whatsapp.message.failed": "failed",
};

/**
 * Estado de un mensaje SALIENTE desde un webhook de Kapso. null = nada que aplicar (otro evento,
 * un mensaje entrante, o un cuerpo sin wamid). No se habilita el "buffering" de Kapso: cambia el
 * cuerpo a formato lote.
 *
 * Forma (docs.kapso.ai, message-events):
 *   { message: { id: "wamid…", kapso: { direction, status, statuses: [{ status, errors: [{ code, title, message }] }] } } }
 */
export function parseKapsoStatusEvent(eventHeader: string | null, body: unknown): KapsoStatusEvent | null {
  const status = eventHeader ? STATUS_EVENTS[eventHeader] : undefined;
  if (!status) return null;
  const message = (body as { message?: unknown } | null)?.message as
    | { id?: unknown; kapso?: { direction?: unknown; statuses?: unknown } }
    | undefined;
  if (!message || typeof message.id !== "string" || !message.id) return null;
  if (message.kapso?.direction !== undefined && message.kapso.direction !== "outbound") return null;

  let code: number | null = null;
  let text: string | null = null;
  if (status === "failed") {
    const statuses = Array.isArray(message.kapso?.statuses) ? (message.kapso.statuses as { errors?: unknown }[]) : [];
    const withErrors = [...statuses].reverse().find((s) => Array.isArray(s?.errors) && s.errors.length > 0);
    const err = (withErrors?.errors as { code?: unknown; title?: unknown; message?: unknown }[] | undefined)?.[0];
    if (err) {
      const n = Number(err.code);
      code = Number.isFinite(n) ? n : null;
      const parts = [err.title, err.message].filter((p): p is string => typeof p === "string" && p.length > 0);
      text = parts.length ? [...new Set(parts)].join(": ") : null;
    }
  }
  return { providerId: message.id, status, code, message: text };
}
