/**
 * Mensajes es-CL para el formulario de inscripción al curso (/curso-dj). Mapea los
 * issues de parseCourseLead() ({field, code}) a texto, más los errores globales.
 * En `lib/` para que vitest lo cubra. La validación vive en el dominio
 * (src/domain/course/lead.ts) y corre igual en cliente y servidor.
 */
import type { CourseLeadField, CourseLeadIssueCode } from "@/src/domain/course/lead";

const FIELD_LABEL: Record<CourseLeadField, string> = {
  name: "el nombre",
  email: "el email",
  phone: "el WhatsApp",
  plan: "qué te interesa",
  experience: "desde dónde partes",
  availability: "tu disponibilidad",
  message: "el mensaje",
};

/** Mensaje por campo+código para pintar bajo el input. */
export function courseFieldMessage(field: CourseLeadField, code: CourseLeadIssueCode): string {
  switch (code) {
    case "required":
      return `Completa ${FIELD_LABEL[field]}.`;
    case "too_long":
      return `${cap(FIELD_LABEL[field])} es demasiado largo.`;
    case "invalid":
      if (field === "email") return "Revisa el email: parece incompleto.";
      if (field === "phone") return "Revisa el número: usa formato +56 9 …";
      return `Revisa ${FIELD_LABEL[field]}.`;
  }
}

/** Error global (línea sobre el botón) para fallas de red o del servidor. */
export function courseErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "network":
      return "Error de conexión. Intenta de nuevo.";
    case "rate_limited":
      return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
    case "json_invalido":
    case "validacion":
      return "Revisa los datos del formulario e intenta de nuevo.";
    default:
      return "No pudimos enviar tu solicitud. Escríbenos por WhatsApp y lo vemos al tiro.";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
