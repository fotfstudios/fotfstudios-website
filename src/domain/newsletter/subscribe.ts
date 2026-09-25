/**
 * Suscripción al newsletter ("avísame cuando publiquen una guía o un post") — validación
 * pura, sin IO. Mismo contrato que parseGuideLead: corre en el cliente antes de enviar Y en
 * el route, así topes y mensajes no se desincronizan. ok (normalizado), spam (honeypot) o
 * invalid (todos los issues juntos).
 */
import { EMAIL_MAX, EMAIL_RE } from "@/src/domain/contact/contact";

/** Espejo del CHECK `newsletter_subscribers_source_valid`. */
export const NEWSLETTER_SOURCE_RE = /^[a-z][a-z0-9_]*$/;

/** Formularios que pueden suscribir. Uno hoy; la DB solo valida la forma. */
export const NEWSLETTER_SOURCES = ["curso_dj"] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

export const NEWSLETTER_CAPS = { email: EMAIL_MAX, utm: 120, referrerHost: 253 } as const;

/** Espejo del CHECK `newsletter_subscribers_token_valid`. */
export const UNSUBSCRIBE_TOKEN_RE = /^[0-9a-f]{48}$/;

export interface NewsletterSubscribeInput {
  email: string;
  source: NewsletterSource;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
  };
  /** Solo el host del referente, nunca la URL completa. */
  referrerHost: string | null;
}

export type NewsletterField = "email" | "source";
export type NewsletterIssueCode = "required" | "too_long" | "invalid";
export type NewsletterIssue = { field: NewsletterField; code: NewsletterIssueCode };

export type ParsedNewsletterSubscribe =
  | { kind: "ok"; value: NewsletterSubscribeInput }
  | { kind: "spam" }
  | { kind: "invalid"; issues: NewsletterIssue[] };

/** Texto de una línea: sin caracteres de control, recortado. */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

/** Los UTM se truncan, nunca invalidan: son basura de campaña, no culpa de quien se suscribe. */
function utmValue(raw: Record<string, unknown>, key: string): string | null {
  const v = str(raw, key).slice(0, NEWSLETTER_CAPS.utm);
  return v === "" ? null : v;
}

const isSource = (s: string): s is NewsletterSource => (NEWSLETTER_SOURCES as readonly string[]).includes(s);

export function parseNewsletterSubscribe(raw: unknown): ParsedNewsletterSubscribe {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { kind: "invalid", issues: [{ field: "email", code: "required" }] };
  }
  const obj = raw as Record<string, unknown>;

  // Honeypot primero: un bot que llena el campo señuelo se descarta en silencio.
  if (typeof obj.website === "string" && obj.website.trim() !== "") return { kind: "spam" };

  const issues: NewsletterIssue[] = [];

  const email = str(obj, "email").toLowerCase();
  if (!email) issues.push({ field: "email", code: "required" });
  else if (email.length > NEWSLETTER_CAPS.email) issues.push({ field: "email", code: "too_long" });
  else if (!EMAIL_RE.test(email)) issues.push({ field: "email", code: "invalid" });

  const source = str(obj, "source");
  if (!source) issues.push({ field: "source", code: "required" });
  else if (!isSource(source)) issues.push({ field: "source", code: "invalid" });

  if (issues.length > 0 || !isSource(source)) return { kind: "invalid", issues };

  const host = str(obj, "referrerHost").slice(0, NEWSLETTER_CAPS.referrerHost);
  return {
    kind: "ok",
    value: {
      email,
      source,
      utm: {
        source: utmValue(obj, "utmSource"),
        medium: utmValue(obj, "utmMedium"),
        campaign: utmValue(obj, "utmCampaign"),
        content: utmValue(obj, "utmContent"),
        term: utmValue(obj, "utmTerm"),
      },
      referrerHost: host === "" ? null : host,
    },
  };
}

/** Mensaje por campo, compartido por el formulario. */
export function newsletterFieldMessage(code: NewsletterIssueCode): string {
  switch (code) {
    case "required":
      return "Escribe tu correo.";
    case "too_long":
      return "El correo es demasiado largo.";
    case "invalid":
      return "Revisa el correo: parece incompleto.";
  }
}

/** Error global (línea sobre el botón) para fallas de red o del servidor. */
export function newsletterErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "network":
      return "Error de conexión. Intenta de nuevo.";
    case "rate_limited":
      return "Demasiados intentos por ahora. Intenta de nuevo más tarde.";
    case "json_invalido":
    case "validacion":
      return "Revisa el correo e intenta de nuevo.";
    default:
      return "No pudimos suscribirte. Intenta de nuevo en un momento.";
  }
}
