/**
 * Guía "Cómo elegir tu pendrive para DJ" (/guia-pendrive-dj) — único punto de edición de
 * la landing. Copy portado de Claude Design ("Landing Guia Pendrive"); el adelanto y los
 * capítulos son los del PDF. Traducido a la marca: Gold como acento, Sirena solo en la
 * píldora y el botón, y la sala "aislada acústicamente".
 */

export const GUIA_PENDRIVE = {
  title: "Cómo elegir tu pendrive para DJ",
  /** Meta description + OG. */
  description:
    "Guía gratis en PDF: velocidad, formato FAT32 vs exFAT, capacidad, materiales y cómo prepararlo con Rekordbox para que tu set cargue rápido en cualquier Pioneer CDJ / XDJ.",
  chapters: 8,
} as const;

export const COPY = {
  hero: {
    pill: "Gratis",
    eyebrow: "Guía completa en PDF",
    h1: ["Cómo elegir tu", "pendrive", "para DJ"] as const,
    /** Índice de la línea del H1 que va en Gold. */
    h1Accent: 1,
    lede: "Velocidad, formato, capacidad, materiales y cómo prepararlo con Rekordbox. Todo lo que necesitas para que tu set cargue rápido y no se corte en ninguna cabina Pioneer CDJ / XDJ.",
  },
  cover: {
    eyebrow: "Guía técnica · Pioneer CDJ / XDJ",
    title: ["Cómo elegir tu", "pendrive", "para DJ"] as const,
    titleAccent: 1,
  },
  adelanto: {
    kicker: "Adelanto",
    h2: ["Lee el primer", "capítulo"] as const,
    locked: "Continúa en la guía",
    listHead: "En la guía completa",
  },
  desbloquear: {
    h2: "Desbloquea la guía completa",
    lede: `Los ${GUIA_PENDRIVE.chapters} capítulos y el checklist de compra, directo a tu correo.`,
  },
  estudio: {
    h2: ["Prueba tu pendrive", "antes del evento"] as const,
    body: "Sala de ensayo DJ aislada acústicamente en Viña del Mar, con 2× Pioneer XDJ-1000MK2 y DJM-450: la cabina estándar de club. Reserva por hora.",
    cta: "Reservar hora",
  },
  form: {
    placeholder: "tu@correo.cl",
    finePrint: "Solo tu correo, y solo para enviarte la guía.",
    privacyLink: "Privacidad",
    success: {
      label: "Listo",
      title: "Revisa tu correo",
      body: "Te enviamos la guía en PDF. Si no aparece en unos minutos, mira en spam o promociones.",
      reset: "Usar otro correo",
    },
  },
} as const;

/** Capítulo 01 del PDF, tal cual: el adelanto que se lee antes de pedir la guía. */
export const ADELANTO = {
  n: "01",
  title: "Velocidad de lectura",
  paragraphs: [
    "Cuando insertas el pendrive, el CDJ lee la base de datos que exportó Rekordbox y luego carga cada pista con su waveform, beatgrid y cue points. Con una memoria lenta esto se nota: la lista tarda en aparecer, la pista demora en cargar y la navegación se traba justo cuando necesitas elegir el siguiente tema.",
    "No uses USB 2.0. Busca memorias USB 3.0, 3.1 o 3.2 con velocidades de lectura de +150 MB/s. La velocidad de escritura también importa, aunque fuera de la cabina…",
  ],
} as const;

/** El resto del índice del PDF: bloqueado hasta dejar el correo. */
export const CAPITULOS = [
  { n: "02", t: "Formato: FAT32 vs exFAT" },
  { n: "03", t: "Cuerpo de metal = cero cuelgues" },
  { n: "04", t: "Capacidad" },
  { n: "05", t: "Los 3 reyes de la cabina" },
  { n: "06", t: "Prepáralo con Rekordbox" },
  { n: "07", t: "Buenas prácticas en la cabina" },
  { n: "08", t: "¡Protege tu set!" },
] as const;
