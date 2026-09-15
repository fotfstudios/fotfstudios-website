/**
 * Guía de iniciación al DJing (/guia-dj) — único punto de edición de la landing.
 * Copy portado de Claude Design ("Landing Guía DJ (sin CTA)"): la página solo renderiza
 * lo que hay acá; el correo de entrega y un futuro listado en el admin leen lo mismo.
 * "sin CTA" = sin venta del curso: esta landing pide un correo y entrega un PDF, nada más.
 */

export const GUIA = {
  title: "Guía de iniciación al DJing",
  /** Meta description + OG. */
  description:
    "Guía gratis en PDF para empezar a mezclar: el equipo explicado, beatmatching paso a paso, EQ, selección musical y una rutina de práctica semanal. Te llega al correo en un minuto.",
  pages: 8,
  /** Número de edición impreso en la portada. */
  numero: "01",
} as const;

/** Copy de la landing por sección (títulos con salto de línea explícito = líneas del display). */
export const COPY = {
  hero: {
    pill: "Gratis",
    eyebrow: `Guía en PDF · ${GUIA.pages} páginas`,
    h1: ["Aprende a", "mezclar sin", "adivinar"] as const,
    /** Índice de la línea del H1 que va en Gold. */
    h1Accent: 2,
    lede: `La Guía de iniciación al DJing: ${GUIA.pages} páginas con el equipo explicado, beatmatching paso a paso, EQ, selección musical y una rutina de práctica semanal. Te llega al correo en un minuto.`,
    proof: "Escrita en la sala, no copiada de internet",
  },
  cover: {
    eyebrow: "Guía descargable",
    title: ["Guía de", "iniciación", "al DJing"] as const,
    titleAccent: 2,
    corner: ["Gratis", `Nº ${GUIA.numero}`] as const,
    specs: [
      { k: "Formato", v: "PDF" },
      { k: "Extensión", v: `${GUIA.pages} págs.` },
    ] as const,
  },
  temas: { eyebrow: "Qué vas a aprender", h2: ["Diez temas,", "cero relleno"] as const },
  fragmento: {
    eyebrow: "Léela antes de pedirla",
    h2: ["Un pedazo de", "la página 4"] as const,
    tag: "Capítulo 02 · Beatmatching",
    afterTag: "Esta es la página 4 de 8",
    afterTitle: ["Las otras siete", "te llegan al correo"] as const,
    afterLede: "EQ y mezcla de graves, cómo armar tu primer set, la rutina semanal y el glosario completo. Gratis, en PDF.",
  },
  paraQuien: {
    eyebrow: "Antes de descargarla",
    h2: ["Para quién sirve", "y para quién no"] as const,
    sirve: "Te va a servir si",
    noSirve: "No es para ti si",
  },
  faq: { h2: "Preguntas frecuentes" },
  cierre: {
    eyebrow: "Descarga gratis",
    h2: ["Empieza por", "entender el", "equipo"] as const,
    lede: `Ocho páginas escritas para quien nunca ha tocado un par de CDJ. Deja tu correo y te llega en un minuto.`,
  },
  form: {
    placeholder: "tu@correo.cl",
    finePrint: "Solo tu correo. Sin spam, cancelas cuando quieras.",
    privacyLink: "Privacidad",
    success: {
      label: "Listo",
      title: "Revisa tu correo",
      body: "Te enviamos la guía en PDF. Si no aparece en unos minutos, mira en spam o promociones.",
    },
  },
} as const;

export const TEMAS = [
  { n: "01", title: "Anatomía del setup", line: "Qué hace cada perilla de un par de CDJ y un mixer, y cómo viaja la señal hasta los parlantes." },
  { n: "02", title: "Beatmatching a mano", line: "Cuatro pasos para igualar dos canciones sin sync y sin depender de la pantalla." },
  { n: "03", title: "Estructura y frases", line: "Cómo contar compases de 8, 16 y 32 para que tus transiciones caigan donde deben." },
  { n: "04", title: "EQ y mezcla de graves", line: "Por qué dos bombos juntos suenan sucios y cómo repartir low, mid y high." },
  { n: "05", title: "Selección y crates", line: "Ordenar tu música por función y no por género, para decidir rápido en cabina." },
  { n: "06", title: "Tu primer set", line: "Un plan de 30 minutos dividido en apertura, subida, peak y cierre." },
  { n: "07", title: "Errores típicos", line: "Los seis hábitos que frenan a casi todos los que empiezan solos." },
  { n: "08", title: "Rutina semanal", line: "Cuatro sesiones de una hora con objetivo claro, en vez de tardes sin rumbo." },
  { n: "09", title: "Qué necesitas", line: "Lo imprescindible para empezar y lo que perfectamente puede esperar." },
  { n: "10", title: "Glosario", line: "Los términos que se usan en cabina, explicados sin misterio." },
] as const;

export type Ilustracion = "pitch" | "cue" | "drift" | "wave";

/** La página 4 del PDF, tal cual, como muestra antes de pedirla. */
export const FRAGMENTO = {
  capitulo: "02",
  capituloTitulo: "Beatmatching",
  pagina: 4,
  lede: "Beatmatching es hacer que dos canciones caminen al mismo paso. Primero igualas la velocidad, después alineas el golpe. El sync hace esto por ti, pero si no sabes hacerlo a mano no vas a escuchar cuándo el sync se equivoca.",
  pasos: [
    {
      n: "01",
      title: "Iguala el BPM",
      body: "Mira el BPM de la canción que suena y mueve el pitch de la otra hasta el mismo número. Diferencias de más de 6 % se notan: elige canciones cercanas.",
      ilustracion: "pitch" as Ilustracion,
      caption: "PITCH A 125.0 BPM",
    },
    {
      n: "02",
      title: "Marca el primer golpe",
      body: "Pon el cue exactamente en el primer bombo de un compás, no un poquito antes. Ese punto es tu referencia para todo lo demás.",
      ilustracion: "cue" as Ilustracion,
      caption: "CUE EN EL GOLPE 1",
    },
    {
      n: "03",
      title: "Lanza y corrige",
      body: "Suelta el cue en el golpe 1 del tema que suena y escucha en audífonos. Si se adelanta, frena el jog; si se atrasa, empújalo. Después ajusta el pitch para que no se vuelva a escapar.",
      ilustracion: "drift" as Ilustracion,
      caption: "EMPUJA HASTA CALZAR",
    },
    {
      n: "04",
      title: "Deja de mirar la pantalla",
      body: "Las formas de onda mienten menos que tu oído al principio, pero te hacen dependiente. Practica tramos completos con la pantalla tapada.",
      ilustracion: "wave" as Ilustracion,
      caption: "ESCUCHA, NO MIRES",
    },
  ],
} as const;

export const PARA_QUIEN_GUIA = {
  sirve: [
    "Nunca has tocado un par de CDJ y no sabes por dónde empezar",
    "Llevas meses viendo tutoriales sueltos sin un orden claro",
    "Mezclas con controlador y quieres pasar a equipo de club",
    "Practicas solo y no tienes quién te corrija",
  ],
  noSirve: [
    "Ya tocas en fiestas y quieres técnica avanzada",
    "Buscas producción musical: esto es solo mezcla en vivo",
    "Esperas atajos. Acá hay método y horas de práctica",
    "Quieres reseñas de equipo: no recomendamos marcas",
  ],
} as const;

export const FAQ_GUIA = [
  { q: "¿La guía tiene costo?", a: "No. Es gratis y te llega al correo en PDF apenas dejas tu email." },
  {
    q: "¿Sirve si nunca toqué un CDJ?",
    a: "Está escrita justamente para eso. El primer capítulo explica el equipo desde cero, sin asumir nada.",
  },
  {
    q: "¿Necesito equipo propio para aprovecharla?",
    a: "Puedes leerla completa sin equipo. Para practicar necesitas acceso a un par de reproductores y un mixer, aunque sea un par de horas a la semana.",
  },
  {
    q: "¿Qué pasa con mi correo?",
    a: "Lo usamos para enviarte la guía y, de vez en cuando, material nuevo para DJs que están empezando. Nada más, y te puedes borrar con un clic.",
  },
] as const;
