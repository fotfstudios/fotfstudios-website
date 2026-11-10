/**
 * Origen de una RESERVA — de qué anuncio (o no) llegó quien reservó, y las señales que la
 * conversión servidor (GA4 + Google Ads + Meta, PR3) necesita para atribuir y deduplicar.
 * Lógica pura, sin IO: la usa el route /api/bookings para normalizar lo que manda el
 * navegador antes de escribirlo en `orders` (ver migración 20261106120000_orders_atribucion).
 *
 * Es el MISMO patrón que los leads del curso (`src/domain/course/attribution.ts`), extendido
 * con lo que una conversión servidor pide y un lead no: la cookie `_ga` (client_id/session_id
 * de GA4 Measurement Protocol), las cookies `_fbc`/`_fbp` (Meta Conversions API) y la landing.
 *
 * Reglas de confianza, iguales que en los leads:
 * - **Click IDs** que agrega la plataforma: `gclid`/`gbraid`/`wbraid` (Google Ads) prueban un
 *   clic pagado; `fbclid` NO (Meta lo agrega a cualquier salida de FB/IG, pagada u orgánica).
 * - **UTM** las pone quien arma la campaña (única forma de marcar un anuncio de Meta).
 *
 * Todo se TRUNCA o se descarta, NUNCA invalida la reserva: un parámetro raro en la URL o una
 * cookie ilegible no son motivo para perder a alguien que está reservando. Un click ID / cookie
 * truncado ya no sirve para atribuir, así que si es raro o largo se descarta ENTERO (espeja el
 * CHECK `orders_attribution_charset`); los UTM, el host y la landing solo se recortan.
 */

import { ATTRIBUTION_CAPS, CLICK_ID_RE } from "@/src/domain/course/attribution";

/** Topes por columna — espejan los CHECK de la migración de `orders`. */
export const ORDER_ATTRIBUTION_CAPS = {
  utm: ATTRIBUTION_CAPS.utm, // 120
  referrerHost: ATTRIBUTION_CAPS.referrerHost, // 253
  landingPath: 512,
  clickId: ATTRIBUTION_CAPS.clickId, // 512 — gclid/gbraid/wbraid/fbclid/fbc/fbp
  gaClientId: 128,
  gaSessionId: 64,
} as const;

export interface OrderAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  /** Solo el host del referente, nunca la URL completa. */
  referrerHost: string | null;
  /** Path + query de la landing (p. ej. "/reservar?utm_source=meta"). Solo se recorta. */
  landingPath: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  /** Cookie _fbc de Meta ("fb.1.<ts>.<fbclid>"). */
  fbc: string | null;
  /** Cookie _fbp de Meta. */
  fbp: string | null;
  /** client_id de GA4 (de la cookie _ga). Lo exige Measurement Protocol. */
  gaClientId: string | null;
  /** session_id de GA4 (de la cookie _ga_<stream>), para coser la sesión. */
  gaSessionId: string | null;
}

export const EMPTY_ORDER_ATTRIBUTION: OrderAttribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrerHost: null,
  landingPath: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
  fbc: null,
  fbp: null,
  gaClientId: null,
  gaSessionId: null,
};

/** String saneada: sin caracteres de control, recortada. */
function str(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
}

/** Texto libre (UTM, host, landing): solo se recorta al tope. */
function capped(raw: Record<string, unknown>, key: string, max: number): string | null {
  const v = str(raw, key).slice(0, max);
  return v === "" ? null : v;
}

/** Valor con charset base64url+punto (click IDs y cookies): si es raro o largo, se descarta entero. */
function charset(raw: Record<string, unknown>, key: string, max: number): string | null {
  const v = str(raw, key);
  if (v === "" || v.length > max || !CLICK_ID_RE.test(v)) return null;
  return v;
}

/** Normaliza el crudo del navegador a la forma que se persiste en `orders`. */
export function parseOrderAttribution(raw: unknown): OrderAttribution {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_ORDER_ATTRIBUTION;
  const r = raw as Record<string, unknown>;
  return {
    utmSource: capped(r, "utmSource", ORDER_ATTRIBUTION_CAPS.utm),
    utmMedium: capped(r, "utmMedium", ORDER_ATTRIBUTION_CAPS.utm),
    utmCampaign: capped(r, "utmCampaign", ORDER_ATTRIBUTION_CAPS.utm),
    utmContent: capped(r, "utmContent", ORDER_ATTRIBUTION_CAPS.utm),
    utmTerm: capped(r, "utmTerm", ORDER_ATTRIBUTION_CAPS.utm),
    referrerHost: capped(r, "referrerHost", ORDER_ATTRIBUTION_CAPS.referrerHost)?.toLowerCase() ?? null,
    landingPath: capped(r, "landingPath", ORDER_ATTRIBUTION_CAPS.landingPath),
    gclid: charset(r, "gclid", ORDER_ATTRIBUTION_CAPS.clickId),
    gbraid: charset(r, "gbraid", ORDER_ATTRIBUTION_CAPS.clickId),
    wbraid: charset(r, "wbraid", ORDER_ATTRIBUTION_CAPS.clickId),
    fbclid: charset(r, "fbclid", ORDER_ATTRIBUTION_CAPS.clickId),
    fbc: charset(r, "fbc", ORDER_ATTRIBUTION_CAPS.clickId),
    fbp: charset(r, "fbp", ORDER_ATTRIBUTION_CAPS.clickId),
    gaClientId: charset(r, "gaClientId", ORDER_ATTRIBUTION_CAPS.gaClientId),
    gaSessionId: charset(r, "gaSessionId", ORDER_ATTRIBUTION_CAPS.gaSessionId),
  };
}

/** ¿Hay algo que valga la pena escribir? (una reserva directa no trae nada). */
export function hasOrderAttribution(a: OrderAttribution): boolean {
  return Object.values(a).some((v) => v !== null);
}
