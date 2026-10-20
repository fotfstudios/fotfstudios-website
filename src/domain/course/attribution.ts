/**
 * Origen de una solicitud del curso — de qué anuncio (o no) llegó la persona. Lógica
 * pura, sin IO: la usan el route (para normalizar lo que manda el navegador) y la bandeja
 * del admin (para mostrar un canal legible).
 *
 * Dos tipos de señal, con confianza distinta:
 * - **Click IDs** que agrega la plataforma sola: `gclid`/`gbraid`/`wbraid` (Google Ads,
 *   auto-tagging) son prueba de un clic pagado. `fbclid` NO: Meta lo agrega a cualquier
 *   enlace saliente de Facebook/Instagram, pagado u orgánico.
 * - **UTM** que pone quien arma la campaña. En Meta son la única forma de distinguir un
 *   anuncio de un post: los anuncios deben llevar `utm_source=meta&utm_medium=paid`.
 *
 * Todo se TRUNCA o se descarta, nunca invalida la solicitud: un parámetro raro en la URL
 * no es motivo para perder a alguien que quiere tomar el curso.
 */

export const ATTRIBUTION_CAPS = { utm: 120, referrerHost: 253, clickId: 512 } as const;

/** Espejo del CHECK `course_leads_click_ids_charset`: base64url + punto. */
export const CLICK_ID_RE = /^[A-Za-z0-9._-]+$/;

export interface CourseLeadAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** Solo el host del referente, nunca la URL completa. */
  referrerHost: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
}

export const EMPTY_ATTRIBUTION: CourseLeadAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrerHost: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
};

function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

function capped(raw: Record<string, unknown>, key: string, max: number): string | null {
  const v = str(raw, key).slice(0, max);
  return v === "" ? null : v;
}

/** Un click ID truncado ya no sirve para nada: si es raro o largo, se descarta entero. */
function clickId(raw: Record<string, unknown>, key: string): string | null {
  const v = str(raw, key);
  if (v === "" || v.length > ATTRIBUTION_CAPS.clickId || !CLICK_ID_RE.test(v)) return null;
  return v;
}

export function parseAttribution(raw: Record<string, unknown>): CourseLeadAttribution {
  return {
    utmSource: capped(raw, "utmSource", ATTRIBUTION_CAPS.utm),
    utmMedium: capped(raw, "utmMedium", ATTRIBUTION_CAPS.utm),
    utmCampaign: capped(raw, "utmCampaign", ATTRIBUTION_CAPS.utm),
    utmContent: capped(raw, "utmContent", ATTRIBUTION_CAPS.utm),
    utmTerm: capped(raw, "utmTerm", ATTRIBUTION_CAPS.utm),
    referrerHost: capped(raw, "referrerHost", ATTRIBUTION_CAPS.referrerHost)?.toLowerCase() ?? null,
    gclid: clickId(raw, "gclid"),
    gbraid: clickId(raw, "gbraid"),
    wbraid: clickId(raw, "wbraid"),
    fbclid: clickId(raw, "fbclid"),
  };
}

export type LeadChannel =
  | "google_ads"
  | "meta_ads"
  | "meta"
  | "google_organico"
  | "utm"
  | "referido"
  | "directo";

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  meta: "Meta (sin UTM)",
  google_organico: "Google orgánico",
  utm: "Campaña",
  referido: "Referido",
  directo: "Directo",
};

const META_SOURCE_RE = /^(meta|facebook|fb|instagram|ig)$/i;
const PAID_MEDIUM_RE = /^(paid|paid_social|paidsocial|cpc|ppc|ads?)$/i;
const META_HOST_RE = /(^|\.)(facebook\.com|instagram\.com|fb\.com|fb\.me)$/;
const GOOGLE_HOST_RE = /(^|\.)google\.[a-z.]+$/;

/**
 * El canal más probable, de la señal más fuerte a la más débil. `detail` es lo que
 * conviene mostrar al lado (la campaña, el source o el host).
 */
export function leadChannel(a: CourseLeadAttribution): { channel: LeadChannel; detail: string | null } {
  if (a.gclid || a.gbraid || a.wbraid) return { channel: "google_ads", detail: a.utmCampaign };

  const source = a.utmSource ?? "";
  const paid = PAID_MEDIUM_RE.test(a.utmMedium ?? "");
  if (META_SOURCE_RE.test(source) && paid) return { channel: "meta_ads", detail: a.utmCampaign };
  if (/^google$/i.test(source) && paid) return { channel: "google_ads", detail: a.utmCampaign };
  if (source) return { channel: "utm", detail: [source, a.utmMedium].filter(Boolean).join(" / ") };

  const host = a.referrerHost ?? "";
  if (a.fbclid || META_HOST_RE.test(host)) return { channel: "meta", detail: host || null };
  if (GOOGLE_HOST_RE.test(host)) return { channel: "google_organico", detail: null };
  if (host) return { channel: "referido", detail: host };
  return { channel: "directo", detail: null };
}
