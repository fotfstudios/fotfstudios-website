/**
 * Google Consent Mode v2 — config puro y helpers. Sin estado ni efectos: el
 * script inline (layout) y el banner (cliente) consumen estas piezas.
 */
export const STORAGE_KEY = "fotf-consent";

/** EEA + Reino Unido + Suiza → denegado por defecto hasta opt-in. */
export const CONSENT_REGIONS_DENIED = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
] as const;

export type ConsentValue = "granted" | "denied";

export interface StoredConsent {
  analytics: ConsentValue;
  ts: number;
}

/** Script inline de Consent Mode v2: defaults por región + re-aplica la elección guardada. */
export function buildConsentDefaultScript(): string {
  const region = JSON.stringify([...CONSENT_REGIONS_DENIED]);
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
gtag('consent','default',{region:${region},analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var s=localStorage.getItem('${STORAGE_KEY}');if(s){var c=JSON.parse(s);gtag('consent','update',{analytics_storage:c.analytics,ad_storage:c.analytics,ad_user_data:c.analytics,ad_personalization:c.analytics});}}catch(e){}`;
}

/** Señales gtag para una elección (ads ligadas a analytics por ahora). */
export function consentUpdateSignals(analytics: ConsentValue) {
  return {
    analytics_storage: analytics,
    ad_storage: analytics,
    ad_user_data: analytics,
    ad_personalization: analytics,
  };
}

/** Serializa la elección para localStorage. */
export function serializeConsent(analytics: ConsentValue, ts: number): string {
  return JSON.stringify({ analytics, ts } satisfies StoredConsent);
}

/** Parsea la elección guardada; null si ausente o inválida. */
export function parseConsent(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredConsent>;
    if ((v.analytics === "granted" || v.analytics === "denied") && typeof v.ts === "number") {
      return { analytics: v.analytics, ts: v.ts };
    }
    return null;
  } catch {
    return null;
  }
}
