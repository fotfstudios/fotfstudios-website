/**
 * Leads de la Guía de iniciación al DJing (/guia-dj) — validación pura, sin IO.
 * Mismo contrato que parseCourseLead (/curso-dj): corre en el cliente antes de enviar Y
 * en el route handler, así topes y mensajes nunca se desincronizan. Tres vías: ok (email
 * normalizado + origen), spam (honeypot, se descarta en silencio) o invalid (TODOS los
 * issues juntos).
 *
 * Un lead es solo un email + desde qué formulario de la landing llegó (`source`, primer
 * toque). No hay nombre ni teléfono a propósito: la guía se pide en un campo.
 */
import { EMAIL_MAX, EMAIL_RE } from "@/src/domain/contact/contact";

/** Los tres formularios de la landing. Espejo del CHECK `guide_leads_source_valid`. */
export const GUIDE_LEAD_SOURCES = ["hero", "fragmento", "cierre"] as const;
export type GuideLeadSource = (typeof GUIDE_LEAD_SOURCES)[number];

/** Topes de largo por campo. Los usa el form (maxLength), el route y el CHECK de la DB. */
export const GUIDE_LEAD_CAPS = { email: EMAIL_MAX } as const;

export type GuideLeadField = "email" | "source";
export type GuideLeadIssueCode = "required" | "too_long" | "invalid";
export type GuideLeadIssue = { field: GuideLeadField; code: GuideLeadIssueCode };

/** Salida normalizada, lista para el RPC. */
export interface GuideLeadInput {
  email: string;
  source: GuideLeadSource;
}

export type ParsedGuideLead =
  | { kind: "ok"; value: GuideLeadInput }
  | { kind: "spam" }
  | { kind: "invalid"; issues: GuideLeadIssue[] };

/** Texto de una línea: sin caracteres de control (CR/LF/TAB/NUL…), recortado. */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

export function parseGuideLead(raw: unknown): ParsedGuideLead {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", issues: [{ field: "email", code: "required" }] };
  }
  const obj = raw as Record<string, unknown>;

  // Honeypot primero: un bot que llena el campo señuelo se descarta en silencio.
  if (typeof obj.website === "string" && obj.website.trim() !== "") {
    return { kind: "spam" };
  }

  const issues: GuideLeadIssue[] = [];

  const email = str(obj, "email").toLowerCase();
  if (!email) issues.push({ field: "email", code: "required" });
  else if (email.length > GUIDE_LEAD_CAPS.email) issues.push({ field: "email", code: "too_long" });
  else if (!EMAIL_RE.test(email)) issues.push({ field: "email", code: "invalid" });

  const source = str(obj, "source");
  if (!source) issues.push({ field: "source", code: "required" });
  else if (!(GUIDE_LEAD_SOURCES as readonly string[]).includes(source)) {
    issues.push({ field: "source", code: "invalid" });
  }

  if (issues.length > 0) return { kind: "invalid", issues };
  return { kind: "ok", value: { email, source: source as GuideLeadSource } };
}
