/**
 * Mensajes es-CL del formulario de la guía (/guia-dj). Mapea los issues de
 * parseGuideLead() ({field, code}) a texto, más los errores globales del route. Mismo
 * reparto que lib/course-form.ts: la validación vive en el dominio y corre igual en
 * cliente y servidor; acá solo hay copy.
 */
import type { GuideLeadField, GuideLeadIssueCode } from "@/src/domain/guide/lead";

const FIELD_LABEL: Record<GuideLeadField, string> = {
  email: "tu correo",
  source: "el formulario",
  // El visitante nunca elige la guía —la pone la landing—, así que un error acá es un
  // bug nuestro o una request armada a mano. El texto igual tiene que existir.
  guide: "la guía",
};

/** Mensaje por campo+código para pintar bajo el input. */
export function guiaFieldMessage(field: GuideLeadField, code: GuideLeadIssueCode): string {
  switch (code) {
    case "required":
      return `Escribe ${FIELD_LABEL[field]}.`;
    case "too_long":
      return `${cap(FIELD_LABEL[field])} es demasiado largo.`;
    case "invalid":
      if (field === "email") return "Revisa el correo: parece incompleto.";
      return `Revisa ${FIELD_LABEL[field]}.`;
  }
}

/** Error global (línea sobre el botón) para fallas de red o del servidor. */
export function guiaErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "network":
      return "Error de conexión. Intenta de nuevo.";
    case "rate_limited":
      // Puede que la guía ya esté en camino: el re-pedido manda el mismo link.
      return "Demasiados intentos por ahora. Si ya pediste la guía, revisa tu correo (también spam o promociones).";
    case "json_invalido":
    case "validacion":
      return "Revisa el correo e intenta de nuevo.";
    default:
      return "No pudimos enviar la guía. Intenta de nuevo en un momento.";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
