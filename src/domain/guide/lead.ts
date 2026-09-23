/**
 * Leads de las guías gratis — validación pura, sin IO.
 *
 * Mismo contrato que parseCourseLead: corre en el cliente antes de enviar Y en el route
 * handler, así topes y mensajes nunca se desincronizan. Tres vías: ok (normalizado), spam
 * (honeypot, se descarta en silencio) o invalid (TODOS los issues juntos).
 *
 * Un lead es un correo, desde qué formulario llegó (`source`, primer toque) y a QUÉ GUÍA
 * corresponde. El catálogo de guías entra como DATO —no se importa lib/guides— para que el
 * dominio siga sin conocer capas de afuera.
 */
import { EMAIL_MAX, EMAIL_RE } from "@/src/domain/contact/contact";

/** Espejo del CHECK `guide_leads_guide_slug_valid`. */
export const GUIDE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Espejo del CHECK `guide_leads_source_valid`. */
export const GUIDE_SOURCE_RE = /^[a-z][a-z0-9_]*$/;

/** Topes de largo por campo. Los usa el form (maxLength), el route y los CHECK de la DB. */
export const GUIDE_LEAD_CAPS = { email: EMAIL_MAX, source: 24, guide: 40, utm: 120, referrerHost: 253 } as const;

/** Lo que el dominio necesita saber de una guía para validar un lead. */
export interface GuideCatalogEntry {
  readonly slug: string;
  /** Los `source` que esa landing puede emitir. */
  readonly sources: readonly string[];
}

export interface GuideLeadUtm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

/** Salida normalizada, lista para el RPC. */
export interface GuideLeadInput {
  email: string;
  source: string;
  guide: string;
  utm: GuideLeadUtm;
  /** Solo el host del referente, nunca la URL completa. */
  referrerHost: string | null;
}

export type GuideLeadField = "email" | "source" | "guide";
export type GuideLeadIssueCode = "required" | "too_long" | "invalid";
export type GuideLeadIssue = { field: GuideLeadField; code: GuideLeadIssueCode };

export type ParsedGuideLead =
  | { kind: "ok"; value: GuideLeadInput }
  | { kind: "spam" }
  | { kind: "invalid"; issues: GuideLeadIssue[] };

/** Texto de una línea: sin caracteres de control (CR/LF/TAB/NUL…), recortado. */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

/**
 * Los UTM se TRUNCAN, nunca invalidan el lead.
 *
 * Vienen de la query string: un `utm_content` gigante es basura de una campaña mal armada,
 * no motivo para no entregarle la guía a alguien que la pidió.
 */
function utmValue(raw: Record<string, unknown>, key: string): string | null {
  const v = str(raw, key).slice(0, GUIDE_LEAD_CAPS.utm);
  return v === "" ? null : v;
}

export function parseGuideLead(raw: unknown, catalog: GuideCatalogEntry): ParsedGuideLead {
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

  // La guía la resuelve el route contra el registro ANTES de llamar acá; esto es la red.
  const guide = str(obj, "guide");
  if (!guide) issues.push({ field: "guide", code: "required" });
  else if (guide !== catalog.slug) issues.push({ field: "guide", code: "invalid" });

  const source = str(obj, "source");
  if (!source) issues.push({ field: "source", code: "required" });
  else if (!catalog.sources.includes(source)) issues.push({ field: "source", code: "invalid" });

  if (issues.length > 0) return { kind: "invalid", issues };

  const host = str(obj, "referrerHost").slice(0, GUIDE_LEAD_CAPS.referrerHost);
  return {
    kind: "ok",
    value: {
      email,
      source,
      guide,
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
