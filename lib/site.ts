/**
 * Fuente única de datos de FOTF Studios.
 * Voz: español de Chile, preciso, directo. Modelos exactos, no generalidades.
 */

export const SITE = {
  name: "FOTF Studios",
  full: "Four On The Floor",
  city: "Viña del Mar",
  region: "Valparaíso",
  country: "Chile",
  address: "Los Chercanes 78a, Viña del Mar, Valparaíso",
  instagram: "fotfstudios",
  instagramUrl: "https://instagram.com/fotfstudios",
  // Número de contacto WhatsApp (placeholder — reemplazar por el real, formato internacional sin +)
  whatsapp: "56962803298",
  whatsappMsg:
    "Hola *FOTF Studios*. Quiero reservar una sesión en la sala de ensayo de DJ.",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Los+Chercanes+78a+Vi%C3%B1a+del+Mar",
} as const;

export const whatsappLink = (msg: string = SITE.whatsappMsg) =>
  `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(msg)}`;

/**
 * Host canónico del sitio (una sola fuente de verdad para SEO: metadata, robots,
 * sitemap, OG, JSON-LD). Producción sirve `www` (el apex redirige 308→www). Es
 * fijo a propósito: el canonical debe apuntar SIEMPRE a producción, sin importar
 * el entorno (local/preview/prod), y no debe acoplarse a `NEXT_PUBLIC_SITE_URL`
 * (que en local apunta al túnel de pruebas de pago). Sin barra final.
 */
export const SITE_URL = "https://www.fotfstudios.cl";

/** El modelo en tres pasos. */
export const STEPS = [
  {
    n: "01",
    title: "Reservas",
    body: "Instagram → WhatsApp → calendario. Eliges el día y la hora.",
  },
  {
    n: "02",
    title: "Acceso autogestionado",
    body: "Entras solo, con tu acceso. Sin esperar a nadie.",
  },
  {
    n: "03",
    title: "Plug & play",
    body: "Conectas tu música y tus audífonos. Todo listo.",
  },
] as const;

/** Equipo — modelo exacto, no generalidades. */
export const GEAR = [
  { qty: "2×", model: "Pioneer XDJ-1000MK2", role: "Reproductores" },
  { qty: "1×", model: "Pioneer DJM-450", role: "Mixer de 2 canales" },
  { qty: "2×", model: "Pioneer DJ VM-50", role: "Monitores de estudio" },
] as const;

/** Lo que incluye la sala. */
export const ROOM_INCLUYE = [
  "Aislamiento acústico",
  "Equipamiento profesional de DJ",
  "Monitores de estudio de calidad",
] as const;

/** Lo que traes tú. */
export const ROOM_TRAES = [
  "Audífonos: traes los tuyos",
  "Dispositivo USB con tu música",
] as const;

/**
 * Solo para marketing/SEO (JSON-LD, badges). La lógica de precios vive en
 * `lib/pricing.ts`. Mantener sincronizado con RATES de ese módulo.
 */
export const PRICING = {
  from: "$14.990",
  priceRange: "$14.990 – $24.990",
} as const;
