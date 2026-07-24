/**
 * Mensajes es-CL para el form de postulación (/unete). Mapea los issues por campo
 * de parseApplication() ({field, code}) a texto, más los errores globales de red/servidor.
 * En `lib/` para que vitest lo cubra. La validación en sí vive en el dominio
 * (src/domain/applications/application.ts) y corre igual en cliente y servidor.
 */
import type { ApplicationField, ApplicationIssueCode } from "@/src/domain/applications/application";

const FIELD_LABEL: Record<ApplicationField, string> = {
  name: "el nombre",
  email: "el email",
  phone: "el WhatsApp",
  format: "qué puedes hacer",
  availability: "tu disponibilidad",
  mixUrl: "el link a tu set",
  instagram: "el Instagram",
  genres: "los géneros",
  pitch: "tu experiencia",
};

/** Mensaje por campo+código para pintar bajo el input. */
export function applicationFieldMessage(field: ApplicationField, code: ApplicationIssueCode): string {
  switch (code) {
    case "required":
      return `Completa ${FIELD_LABEL[field]}.`;
    case "too_long":
      return `${cap(FIELD_LABEL[field])} es demasiado largo.`;
    case "invalid":
      if (field === "email") return "Revisa el email: parece incompleto.";
      if (field === "phone") return "Revisa el número: usa formato +56 9 …";
      if (field === "mixUrl") return "Pega un link válido (SoundCloud, YouTube, Mixcloud…).";
      return `Revisa ${FIELD_LABEL[field]}.`;
  }
}

/** Error global (línea sobre el botón) para fallas de red o del servidor. */
export function applicationErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "network":
      return "Error de conexión. Intenta de nuevo.";
    case "rate_limited":
      return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
    case "json_invalido":
    case "validacion":
      return "Revisa los datos del formulario e intenta de nuevo.";
    default:
      return "No pudimos enviar tu postulación. Intenta de nuevo.";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
