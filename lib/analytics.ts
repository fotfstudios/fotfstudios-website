import { track } from "@vercel/analytics";

/**
 * Eventos de medición del sitio público. Único punto que habla con GTM
 * (dataLayer) y Vercel Analytics — los componentes no empujan a mano.
 * GA4 recibe estos eventos vía el contenedor GTM (ver comentario en
 * app/layout.tsx); cada evento nuevo necesita su trigger + etiqueta ahí.
 * `window.dataLayer` está declarado globalmente en components/ConsentBanner.tsx.
 */

type EventParams = Record<string, string>;

/** Normaliza un pathname al valor `page` de los eventos: "/" → "home", resto sin slashes de borde ("curso-dj", "reserva/estado"). */
export function pageFromPathname(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "home" : trimmed;
}

/** Empuja a dataLayer (GTM/GA4) y a Vercel Analytics. No-op en el servidor; tolera dataLayer ausente (GTM aún no cargó). */
export function pushEvent(event: string, params: EventParams): void {
  if (typeof window === "undefined") return;
  window.dataLayer?.push({ event, ...params });
  track(event, params);
}

/** Clic en cualquier CTA de WhatsApp. `page` sale del pathname salvo que se pase explícito. */
export function trackWhatsAppClick(source: string, page?: string): void {
  if (typeof window === "undefined") return;
  pushEvent("whatsapp_click", {
    source,
    page: page ?? pageFromPathname(window.location.pathname),
  });
}

/** Clic en el CTA principal de reserva: `mode` distingue reserva en línea vs caída a WhatsApp. */
export function trackBookingCta(mode: "online" | "whatsapp", placement: string): void {
  if (typeof window === "undefined") return;
  pushEvent("booking_cta_click", {
    mode,
    placement,
    page: pageFromPathname(window.location.pathname),
  });
}

/**
 * Formulario de inscripción del curso. `start` al tocar el primer campo, `submit`
 * SOLO cuando el servidor respondió 200 — un submit que falló no es una conversión.
 * Recordar: cada evento nuevo necesita su trigger + etiqueta en GTM.
 */
export function trackCourseLead(step: "start" | "submit", plan?: string): void {
  if (typeof window === "undefined") return;
  pushEvent(`course_lead_${step}`, { page: "curso-dj", ...(plan ? { plan } : {}) });
}
