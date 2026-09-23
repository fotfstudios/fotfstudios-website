import { GUIA } from "@/lib/guia-content";

/**
 * Los imanes de leads: las guías en PDF detrás de un formulario.
 *
 * Cada artículo declara en su frontmatter a cuál apunta su CTA de cierre, y el registro
 * de artículos valida ese slug contra estas claves — un typo falla el build con la lista
 * de válidos impresa, en vez de dejar un CTA muerto.
 *
 * Esto NO es el registro completo de guías (ese llega con el multi-guía y trae el copy de
 * la landing, la clave del PDF y las fuentes de formulario). Acá vive solo lo que un
 * artículo necesita para enlazar: a dónde va y qué decir del otro lado.
 */
export interface LeadMagnet {
  /** Ruta de la landing. LITERAL, no derivada del slug: /guia-dj está rankeada. */
  readonly href: `/${string}`;
  readonly title: string;
  /** Línea de servicio en mono: "PDF · 8 páginas · gratis". */
  readonly kicker: string;
  readonly blurb: string;
  readonly cta: string;
}

export const LEAD_MAGNETS = {
  "guia-dj": {
    href: "/guia-dj",
    title: GUIA.title,
    kicker: `PDF · ${GUIA.pages} páginas · gratis`,
    blurb: GUIA.description,
    cta: "Descargar la guía",
  },
} as const satisfies Record<string, LeadMagnet>;

export type LeadMagnetSlug = keyof typeof LEAD_MAGNETS;
export const LEAD_MAGNET_SLUGS = Object.keys(LEAD_MAGNETS) as LeadMagnetSlug[];
export const isLeadMagnetSlug = (s: string): s is LeadMagnetSlug => s in LEAD_MAGNETS;
