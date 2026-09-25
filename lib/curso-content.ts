/**
 * Curso de Iniciación DJ — single edit point for the landing page.
 * Everything the owner tunes (prices, launch line, WhatsApp message, video slot,
 * section copy) lives here; the section components only render it.
 * Program and prices: docs/superpowers/specs/2026-09-25-curso-dj-1a1-design.md.
 */
import { ADDONS, GUIDED_RATE, RATES, VOLUME } from "@/lib/pricing";

export const CURSO = {
  /**
   * Prefilled WhatsApp message shared by EVERY CTA on the page — the landing
   * has exactly one conversion action. Phone number comes from SITE.whatsapp.
   */
  // TODO(owner): confirm final wording before launch
  waMessage:
    "Hola *FOTF Studios*. Quiero más información del *Curso de Iniciación DJ*.",

  /**
   * Scarcity line above the price cards. Count-based on purpose (not a date):
   * statically rendered pages freeze any runtime date math at build time.
   */
  lanzamiento: "Precio de lanzamiento · primeros 10 alumnos",

  /** Default seats when creating a generation in the admin — not shown on the landing. */
  cupos: 6,
} as const;

/** Program shape: the one place copy, JSON-LD and the OG card read the numbers from. */
export const PROGRAMA = {
  sesiones: 6,
  minutosPorSesion: 90,
  horasClase: 9,
  horasPractica: 6,
} as const;

/** "1,5" — session length in hours, formatted for Chilean copy. */
export const HORAS_POR_SESION = (PROGRAMA.minutosPorSesion / 60).toLocaleString("es-CL");

/** CLP amounts as numbers; rendered with formatCLP (149990 → "$149.990"). Launch prices. */
export const PRECIOS = {
  /** Per person, booking as a pair. */
  duo: 149990,
  individual: 249990,
  /** Sesión guiada de prueba, 1 hora. */
  prueba: 19990,
} as const;

/** List prices once the launch cap is reached — shown as "después …". */
export const PRECIOS_LISTA = {
  duo: 159990,
  individual: 269990,
} as const;

/**
 * What the same program costs booked à la carte in valle: room + 1:1 guide for every
 * class hour, the practice hours as one block with its volume discount, and the A+V
 * recording add-on. Derived from lib/pricing.ts so the landing's "−20%" can't go stale.
 */
export const POR_SEPARADO = (() => {
  const clase = PROGRAMA.horasClase * (RATES.valle + GUIDED_RATE);
  const off = VOLUME.find((v) => PROGRAMA.horasPractica >= v.minHours)?.off ?? 0;
  const practica = Math.round(PROGRAMA.horasPractica * RATES.valle * (1 - off));
  return clase + practica + ADDONS.audioVideo.price;
})();

/** Whole-percent discount of `price` against `base` (249990 vs 312762 → 20). */
export function descuento(price: number, base: number): number {
  return Math.round((1 - price / base) * 100);
}

/** Both plans include the same program. */
export const INCLUYE = [
  `${PROGRAMA.horasClase} horas de clase 1:1 (${PROGRAMA.sesiones} sesiones de ${HORAS_POR_SESION} h)`,
  `${PROGRAMA.horasPractica} horas de práctica libre en la sala`,
  "Set final grabado en audio y video",
] as const;

export const SESIONES = [
  {
    n: "01",
    title: "Sonido y primera transición",
    line: "Ganancia, EQ y cue. Sales habiendo mezclado tus primeros dos tracks.",
  },
  {
    n: "02",
    title: "Beatmatching manual",
    line: "Cuadrar a oído, sin sync. La base que separa mezclar de apretar play.",
  },
  {
    n: "03",
    title: "Frases y mezcla larga",
    line: "Contar compases y entrar en frase con el BPM tapado. Sales encadenando cuatro tracks sin parar.",
  },
  {
    n: "04",
    title: "Rekordbox y USB",
    line: "Grid, cues, loops y playlists: un USB que carga en cualquier cabina Pioneer. Traes tu laptop.",
  },
  {
    n: "05",
    title: "Set, filtro y FX",
    line: "Curva de energía, tonalidad, filtro y echo out. Y cuándo sí conviene usar sync.",
  },
  {
    n: "06",
    title: "Set final grabado",
    line: "Soundcheck, traspaso de cabina y tu set de 30 minutos grabado en audio y video, con feedback escrito.",
  },
] as const;

/** "Cómo funciona": del primer contacto al set grabado. */
export const PASOS = [
  {
    n: "01",
    title: "Pide tu prueba",
    line: "Déjanos tu solicitud y coordinamos por WhatsApp tu sesión de prueba de 1 hora.",
  },
  {
    n: "02",
    title: "Fijamos tus 6 fechas",
    line: "Si te gusta, te inscribes y fijamos contigo una sesión por semana, el día y la hora que te acomoden.",
  },
  {
    n: "03",
    title: "Practica y graba",
    line: "Usas tus horas de práctica libre en la sala y cierras con tu set grabado en audio y video.",
  },
] as const;

export const FAQ = [
  {
    q: "¿Necesito saber algo de música?",
    a: "No. Este curso de DJ parte de cero: oído, conteo y técnica se entrenan en la sala, sesión a sesión.",
  },
  {
    q: "¿Cuándo parte?",
    a: "Cuando tú quieras. Las clases son 1:1: fijamos contigo las seis fechas, una por semana, en el día y la hora que te acomoden.",
  },
  {
    q: "¿Puedo tomarlo con un amigo?",
    a: "Sí, en dúo: comparten instructor y cabina, se turnan en los equipos y cada uno paga su precio por persona.",
  },
  {
    q: "¿Tengo que llevar mi propio equipo?",
    a: "No. Trabajas en los equipos de la sala: 2× Pioneer XDJ-1000MK2, mixer DJM-450 y monitores VM-50. Solo traes tus audífonos y un USB con tu música.",
  },
  {
    q: "¿Cómo se paga?",
    a: "El curso se paga 100% anticipado al confirmar tus fechas, por transferencia o con tarjeta vía Mercado Pago.",
  },
  {
    q: "¿Dónde queda?",
    a: "El curso de DJ se dicta en nuestra sala de Viña del Mar, Región de Valparaíso. La dirección exacta se comparte al confirmar tu inscripción.",
  },
] as const;
