import type { LeadMagnetSlug } from "@/lib/lead-magnets";

/**
 * El modelo de contenido de los artículos: qué campos tiene un artículo y qué categorías
 * existen. El frontmatter de cada .mdx se valida contra esto en cada build.
 */

export const ARTICLE_CATEGORIES = ["aprender", "equipo", "precios", "estudio"] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export interface CategoryCopy {
  /** Etiqueta corta del chip del listado. */
  readonly label: string;
  /** H1 y <title> de /blog/categoria/<c>. SIN el sufijo de marca. */
  readonly title: string;
  /** Meta description propia de la categoría. */
  readonly description: string;
}

/**
 * Copy propio por categoría.
 *
 * NO es decorativo: es lo único que evita que /blog/categoria/equipo sea un duplicado
 * delgado de /blog a ojos de Google. Una categoría sin título y descripción propios no
 * merece página. Si una categoría no llega a 2–3 artículos, conviene sacarla del listado
 * antes que publicarla casi vacía.
 */
export const CATEGORY: Record<ArticleCategory, CategoryCopy> = {
  aprender: {
    label: "Aprender",
    title: "Cómo aprender a ser DJ",
    description:
      "Método, tiempos y vicios que evitar para aprender a mezclar desde cero: qué practicar primero, cuánto demora de verdad y cómo armar una rutina que rinda.",
  },
  equipo: {
    label: "Equipo",
    title: "Equipo de DJ: qué comprar y qué no",
    description:
      "Controladores, mixers, audífonos y monitores explicados sin humo: qué necesitas de verdad para partir, qué puede esperar y dónde no conviene ahorrar.",
  },
  precios: {
    label: "Precios",
    title: "Cuánto cuesta ser DJ en Chile",
    description:
      "Precios publicados y comparaciones honestas: qué cuesta un curso de DJ, cuánto sale practicar por hora y en qué se te va la plata cuando estás empezando.",
  },
  estudio: {
    label: "Estudio",
    title: "Grabación y producción",
    description:
      "Grabar un set, producir tus primeros tracks y entender la cadena de audio: qué pasa dentro de una sala aislada acústicamente y cómo sacarle provecho.",
  },
};

/** Topes del frontmatter. Los de título y descripción son los de Google, no antojo. */
export const ARTICLE_CAPS = {
  titleMin: 10,
  titleMax: 70,
  descriptionMin: 50,
  descriptionMax: 160,
  excerptMax: 200,
  ledeMax: 140,
  tags: 6,
  related: 3,
} as const;

/** Frontmatter ya validado y normalizado: todos los opcionales resueltos. */
export interface ArticleMeta {
  /** Nombre del archivo sin .mdx. */
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly excerpt: string;
  /** La única línea Fraunces del artículo. NO se llama `editorial`: ver frontmatter.ts. */
  readonly lede?: string;
  readonly category: ArticleCategory;
  readonly tags: readonly string[];
  /** yyyy-mm-dd */
  readonly publishedAt: string;
  /** yyyy-mm-dd. Igual a publishedAt si el artículo no declara otra. */
  readonly updatedAt: string;
  /** El imán de leads al que apunta el CTA de cierre. */
  readonly guide: LeadMagnetSlug;
  readonly related: readonly string[];
  /** Ruta bajo public/, sin barra inicial. */
  readonly image?: string;
  readonly imageAlt?: string;
  readonly draft: boolean;
  /**
   * Fija el artículo en la columna del footer, que si no muestra los más recientes.
   *
   * Es para las páginas que rankean: sin esto, un artículo que trae tráfico pierde su
   * enlace interno en todo el sitio apenas se publican unos cuantos más nuevos.
   */
  readonly featured: boolean;
  /** Ruta canónica. `/blog/<slug>` salvo override legacy. */
  readonly path: string;
  /** true si `path` vino de un override: entonces NO lo genera /blog/[slug]. */
  readonly legacyPath: boolean;
}
