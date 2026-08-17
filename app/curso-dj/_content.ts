/**
 * Curso de Iniciación DJ — single edit point for the landing page.
 * Everything the owner tunes (prices, deadline, WhatsApp message, video slot,
 * section copy) lives here; the section components only render it.
 */

export const CURSO = {
  /**
   * Prefilled WhatsApp message shared by EVERY CTA on the page — the landing
   * has exactly one conversion action. Phone number comes from SITE.whatsapp.
   */
  // TODO(owner): confirm final wording before launch
  waMessage:
    "Hola *FOTF Studios*. Quiero más información del *Curso de Iniciación DJ*.",

  /** Shown in the scarcity line above the price cards. */
  generacion: "Precios de primera generación",
  cupos: 6,

  /**
   * Display-only deadline for first-generation pricing. Manual constant on
   * purpose (same discipline as CLOSURE / TERMS_VERSION): statically rendered
   * pages freeze any runtime date math at build time.
   */
  // TODO(owner): set the real date before launch
  deadline: "hasta el 30 de septiembre",

  /**
   * Student final-set video. While null the page renders an honest
   * "se publica aquí" slot — never a fake thumbnail. To swap it in, drop the
   * file under /public and set e.g. videoSrc: "/video/curso-set-final.mp4".
   */
  videoSrc: null as string | null,
  videoPoster: null as string | null,
} as const;

/** CLP amounts as numbers; rendered with formatCLP (79990 → "$79.990"). */
export const PRECIOS = {
  /** Per person, booking as a pair. */
  duo: 79990,
  individual: 139990,
  /** Sesión guiada de prueba, 1 hora. */
  prueba: 19990,
} as const;

/** Both plans include the same program. */
export const INCLUYE = [
  "8 horas de clase (4 sesiones de 2 hrs)",
  "4 horas de práctica libre en la sala",
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
    title: "Armado de set",
    line: "Selección, orden y energía: cómo se construye una hora que fluye.",
  },
  {
    n: "04",
    title: "Set final grabado",
    line: "Tocas un set completo en la sala y te lo llevas grabado.",
  },
] as const;

export const PARA_QUIEN = [
  "Nunca has tocado y quieres partir con una base correcta.",
  "Practicas con controlador y quieres pasarte a equipos de club.",
  "Quieres un método concreto, no tutoriales sueltos.",
] as const;

/** Deliberate scope-setting — same visual weight as PARA_QUIEN, not fine print. */
export const NO_ES = [
  "Sin scratch ni turntablism.",
  "Sin vinilo.",
  "Sin producción musical.",
] as const;

export const NO_ES_NOTA =
  "Recorte a propósito: el curso es mezcla en cabina, y eso se aprende bien.";

export const FAQ = [
  {
    q: "¿Necesito saber algo de música?",
    a: "No. El curso parte de cero: oído, conteo y técnica se entrenan en la sala, sesión a sesión.",
  },
  {
    q: "¿Tengo que llevar mi propio equipo?",
    a: "No. Trabajas en los equipos de la sala: 2× Pioneer XDJ-1000MK2, mixer DJM-450 y monitores VM-50. Solo traes tus audífonos y un USB con tu música.",
  },
  {
    q: "¿Puedo pagar en cuotas?",
    a: "No. El curso se paga 100% anticipado al inscribirte; así queda asegurado tu cupo y tus horas de sala.",
  },
  {
    q: "¿Dónde queda?",
    a: "En Viña del Mar. La dirección exacta se comparte al confirmar tu inscripción.",
  },
] as const;
