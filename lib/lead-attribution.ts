/**
 * Origen de la visita para el formulario del curso, leído en el navegador.
 *
 * A diferencia de `readUtm` (guías/newsletter, que lee AL ENVIAR), acá además se recuerda
 * el origen en sessionStorage al llegar: quien entra por un anuncio a /curso-dj, navega al
 * home y vuelve, ya no trae la query con la que llegó. Es la misma sesión, el mismo
 * origen. Se guarda solo si la URL trae una señal real (UTM o click ID), así una
 * navegación interna nunca pisa el origen pagado.
 *
 * Todo en try/catch: sin sessionStorage (ventana privada, bloqueado) simplemente se usa
 * lo que haya en la URL actual.
 */
import { readUtm, type GuiaUtmPayload } from "./guia-utm";

export interface LeadAttributionPayload extends GuiaUtmPayload {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
}

const KEY = "fotf:lead-attribution";
const CLICK_IDS = ["gclid", "gbraid", "wbraid", "fbclid"] as const;

/** Lo que dice ESTA URL. El referente del propio sitio no es un origen: se omite. */
export function readAttribution(
  loc: { search: string; hostname: string },
  referrer: string,
): LeadAttributionPayload {
  const out: LeadAttributionPayload = readUtm(loc, referrer);
  if (out.referrerHost && sameSite(out.referrerHost, loc.hostname)) delete out.referrerHost;
  const q = new URLSearchParams(loc.search);
  for (const k of CLICK_IDS) {
    const v = q.get(k)?.trim();
    if (v) out[k] = v;
  }
  return out;
}

/** ¿Trae una señal de campaña (no solo el referente)? */
export function hasCampaignSignal(a: LeadAttributionPayload): boolean {
  return Boolean(a.utmSource || a.utmMedium || a.utmCampaign || a.gclid || a.gbraid || a.wbraid || a.fbclid);
}

/** Al montar el formulario: guarda el origen de la sesión si esta URL lo trae. */
export function rememberAttribution(current: LeadAttributionPayload, storage: Pick<Storage, "setItem"> | null): void {
  if (!storage || !hasCampaignSignal(current)) return;
  try {
    storage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Sin memoria de sesión: queda lo de la URL.
  }
}

/**
 * Al enviar: la URL actual si trae campaña; si no, lo recordado en la sesión; si no, la
 * URL actual igual (puede traer al menos el referente).
 */
export function resolveAttribution(
  current: LeadAttributionPayload,
  storage: Pick<Storage, "getItem"> | null,
): LeadAttributionPayload {
  if (hasCampaignSignal(current)) return current;
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as unknown;
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        return pickStrings(saved as Record<string, unknown>);
      }
    }
  } catch {
    // JSON roto o storage bloqueado: lo de la URL.
  }
  return current;
}

const FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "referrerHost",
  ...CLICK_IDS,
] as const;

function pickStrings(o: Record<string, unknown>): LeadAttributionPayload {
  const out: LeadAttributionPayload = {};
  for (const f of FIELDS) {
    const v = o[f];
    if (typeof v === "string" && v.trim()) out[f] = v.trim();
  }
  return out;
}

function sameSite(host: string, own: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return own !== "" && strip(host) === strip(own);
}

/** sessionStorage sin reventar en ventana privada / storage bloqueado. */
export function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
