/**
 * Origen de una reserva, leído en el navegador para mandarlo en `POST /api/bookings`.
 *
 * Reutiliza el lector de URL de los leads (`lead-attribution`) para los UTM / click IDs /
 * referente, y le suma lo que una CONVERSIÓN servidor necesita y un lead no:
 * - la landing (path + query con la que se entró),
 * - la cookie `_ga` → client_id + session_id de GA4 (Measurement Protocol los exige),
 * - las cookies `_fbp` / `_fbc` de Meta (Conversions API).
 *
 * Igual que los leads: al MONTAR el widget se recuerda el origen de la sesión si la URL trae
 * una señal de campaña (así quien entra por un anuncio, navega y vuelve no pierde el origen);
 * al ENVIAR se resuelve ese origen y se leen las cookies del documento actual. Todo tolera la
 * ausencia de cookies / sessionStorage (consentimiento denegado, GTM sin cargar, ventana
 * privada): degrada en silencio y la reserva sigue. El servidor revalida y descarta lo raro.
 */
import {
  hasCampaignSignal,
  readAttribution,
  sessionStore,
  type LeadAttributionPayload,
} from "./lead-attribution";

export interface BookingAttributionPayload extends LeadAttributionPayload {
  landingPath?: string;
  fbc?: string;
  fbp?: string;
  gaClientId?: string;
  gaSessionId?: string;
}

const KEY = "fotf:booking-attribution";
const LANDING_MAX = 512;

/** "/reservar?utm_source=meta" — path + query, sin el host (puede llevar datos). */
function landingPathOf(loc: { pathname: string; search: string }): string {
  return `${loc.pathname}${loc.search}`.slice(0, LANDING_MAX);
}

/** El origen de URL (UTM/click IDs/referente) + la landing de ESTA página. */
function urlOrigin(loc: { pathname: string; search: string; hostname: string }, referrer: string): BookingAttributionPayload {
  return { ...readAttribution(loc, referrer), landingPath: landingPathOf(loc) };
}

/** Al montar el widget: recuerda el origen de la sesión si esta URL trae campaña. */
export function rememberBookingOrigin(): void {
  if (typeof window === "undefined") return;
  const current = readAttribution(window.location, document.referrer);
  if (!hasCampaignSignal(current)) return;
  const store = sessionStore();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(urlOrigin(window.location, document.referrer)));
  } catch {
    // Sin memoria de sesión: al enviar se usa lo que haya en la URL.
  }
}

function readStored(): BookingAttributionPayload | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as unknown;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const out: BookingAttributionPayload = {};
    for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k as keyof BookingAttributionPayload] = v.trim();
    }
    return out;
  } catch {
    return null;
  }
}

/** Mapa de cookies del documento (vacío si no hay document). */
function cookies(): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof document === "undefined") return map;
  for (const part of document.cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) map.set(name, decodeURIComponent(part.slice(i + 1).trim()));
  }
  return map;
}

/** _ga = "GA1.<n>.<client_id>" → el client_id es todo lo que sigue a los dos primeros tramos. */
function gaClientIdFrom(c: Map<string, string>): string | undefined {
  const raw = c.get("_ga");
  if (!raw) return undefined;
  const parts = raw.split(".");
  if (parts.length < 4 || parts[0] !== "GA1") return undefined;
  const id = parts.slice(2).join(".");
  return id || undefined;
}

/** _ga_<STREAM> = "GS1.1.<session_id>.…" → el session_id es el tercer tramo. */
function gaSessionIdFrom(c: Map<string, string>): string | undefined {
  for (const [name, value] of c) {
    if (!/^_ga_[A-Z0-9]+$/.test(name) || !value.startsWith("GS1.")) continue;
    const sid = value.split(".")[2];
    if (sid) return sid;
  }
  return undefined;
}

/** Al enviar: origen resuelto (campaña de esta URL, o lo recordado) + cookies del documento. */
export function collectBookingAttribution(): BookingAttributionPayload {
  if (typeof window === "undefined") return {};
  const current = readAttribution(window.location, document.referrer);
  const origin = hasCampaignSignal(current)
    ? urlOrigin(window.location, document.referrer)
    : (readStored() ?? urlOrigin(window.location, document.referrer));

  const c = cookies();
  const out: BookingAttributionPayload = { ...origin };
  const gaClientId = gaClientIdFrom(c);
  const gaSessionId = gaSessionIdFrom(c);
  const fbp = c.get("_fbp");
  const fbc = c.get("_fbc");
  if (gaClientId) out.gaClientId = gaClientId;
  if (gaSessionId) out.gaSessionId = gaSessionId;
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  return out;
}
