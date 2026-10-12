import { track } from "@vercel/analytics";

/**
 * Eventos de medición del sitio público. Único punto que habla con GTM
 * (dataLayer) y Vercel Analytics — los componentes no empujan a mano.
 * GA4 recibe estos eventos vía el contenedor GTM (ver comentario en
 * components/PublicChrome.tsx); cada evento nuevo necesita su trigger + etiqueta ahí.
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

/**
 * Embudo de las guías gratis: `start` al primer tecleo, `submit` solo con 200 del route.
 * `guide` es el slug; `source` es cuál formulario de esa landing convirtió.
 *
 * `page` se mantiene IGUAL al slug —para /guia-dj era literalmente "guia-dj"—, así ningún
 * informe de GA4 existente se corta. Y se agrega `guide` como parámetro en vez de acuñar
 * nombres de evento nuevos: cada VALOR nuevo pediría su trigger y su etiqueta en GTM, o sea
 * un cambio de contenedor por guía para siempre; un parámetro se configura una sola vez.
 */
export function trackGuideLead(step: "start" | "submit", guide: string, source: string): void {
  if (typeof window === "undefined") return;
  pushEvent(`guide_lead_${step}`, { page: guide, guide, source });
}

/**
 * Suscripción al newsletter ("Sigue aprendiendo"). `start` al primer tecleo, `submit`
 * solo con 200 del route. `source` es el formulario (hoy solo "curso_dj").
 * Recordar: cada evento nuevo necesita su trigger + etiqueta en GTM.
 */
export function trackNewsletter(step: "start" | "submit", source: string): void {
  if (typeof window === "undefined") return;
  pushEvent(`newsletter_${step}`, { page: "curso-dj", source });
}

/**
 * Clic en el CTA de cierre de un artículo hacia su guía en PDF. Es el único salto
 * medible del embudo artículo → guía: el artículo es abierto y la guía pide el correo.
 * `guide` es el slug del imán; `page` es el artículo desde donde se saltó.
 * Recordar: este evento necesita su trigger + etiqueta en GTM para llegar a GA4.
 */
export function trackGuideCtaClick(guide: string, placement: string): void {
  if (typeof window === "undefined") return;
  pushEvent("guide_cta_click", {
    guide,
    placement,
    page: pageFromPathname(window.location.pathname),
  });
}

/* ── Embudo de reserva (/reservar → /reserva/estado) ─────────────────────────────────── */

/** Ítem GA4 (ecommerce). La sala va como un ítem con cantidad = horas. */
export interface GaItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
}

const BOOKING_PAGE = "reservar";

/**
 * Evento ecommerce de GA4: primero `{ ecommerce: null }` (recomendación de GA4 para que el
 * objeto del evento anterior no se arrastre), después el evento con el objeto `ecommerce`
 * estándar — en GTM basta "Enviar datos de ecommerce → Capa de datos", sin mapear `items`.
 * A Vercel Analytics va una copia plana: solo acepta primitivos.
 */
function pushEcommerce(
  event: string,
  ecommerce: { value?: number; transaction_id?: string; coupon?: string; items: GaItem[] },
  extra: Record<string, string> = {},
): void {
  if (typeof window === "undefined") return;
  const eco = { currency: "CLP", ...ecommerce };
  window.dataLayer?.push({ ecommerce: null });
  window.dataLayer?.push({ event, ...extra, ecommerce: eco });
  const flat: Record<string, string | number> = { currency: "CLP" };
  if (eco.value !== undefined) flat.value = eco.value;
  if (eco.transaction_id) flat.transaction_id = eco.transaction_id;
  track(event, { ...flat, ...extra, ...(eco.coupon ? { coupon: eco.coupon } : {}) });
}

/** Una vez por carga de /reservar. */
export function trackViewItem(item: GaItem): void {
  pushEcommerce("view_item", { items: [item] });
}

/** Extra agregado (grabación / guía). */
export function trackAddon(item: GaItem): void {
  pushEcommerce("add_to_cart", { value: item.price * item.quantity, items: [item] });
}

/** Horario elegido (intención; el llamador lo debouncea). */
export function trackSlotSelected(p: { date: string; start: string; durationHours: number; tier: string }): void {
  if (typeof window === "undefined") return;
  pushEvent("booking_slot_selected", {
    date: p.date,
    start: p.start,
    duration_hours: String(p.durationHours),
    tier: p.tier,
    page: BOOKING_PAGE,
  });
}

/** Avance del wizard móvil (02 Datos / 03 Pagar). */
export function trackBookingStep(step: "datos" | "pago"): void {
  if (typeof window === "undefined") return;
  pushEvent("booking_step", { step, page: BOOKING_PAGE });
}

/** Entró con el código del correo sin salir del checkout. */
export function trackLogin(): void {
  if (typeof window === "undefined") return;
  pushEvent("login", { method: "email_otp", page: BOOKING_PAGE });
}

/** Error al crear la reserva (código de lib/booking-error.ts). */
export function trackCheckoutError(code: string): void {
  if (typeof window === "undefined") return;
  pushEvent("checkout_error", { code, page: BOOKING_PAGE });
}

export type PaymentType = "mercadopago" | "beatcoins" | "transferencia";

/** Pedido creado y camino de pago elegido (antes del redirect / brick / confirmación). */
export function trackBeginCheckout(p: {
  orderId: string;
  value: number;
  items: GaItem[];
  coupon?: string;
  paymentType: PaymentType;
}): void {
  pushEcommerce(
    "begin_checkout",
    { value: p.value, transaction_id: p.orderId, ...(p.coupon ? { coupon: p.coupon } : {}), items: p.items },
    { payment_type: p.paymentType },
  );
}

/** Pago confirmado (lo decide isFreshPurchase en lib/estado-ui.ts). GA4 dedupa por transaction_id. */
export function trackPurchase(p: { orderId: string; value: number; items: GaItem[]; paymentType: PaymentType }): void {
  pushEcommerce("purchase", { value: p.value, transaction_id: p.orderId, items: p.items }, { payment_type: p.paymentType });
}
