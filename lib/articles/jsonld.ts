import { SITE, SITE_URL } from "@/lib/site";

/** Un nivel intermedio del breadcrumb (entre Inicio y el artículo). */
export interface ArticleCrumb {
  readonly name: string;
  /** Ruta absoluta desde la raíz, con "/" inicial: "/blog". */
  readonly path: string;
}

export interface ArticleJsonLdInput {
  /**
   * Ruta canónica con "/" inicial y sin barra final: "/aprender-dj", "/blog/x".
   * Antes esto era un `slug` pelado; es una RUTA para que sirva igual a los artículos
   * en raíz (rankeados) que a los que viven bajo /blog.
   */
  readonly path: string;
  readonly headline: string;
  readonly description: string;
  /** yyyy-mm-dd */
  readonly datePublished: string;
  /** yyyy-mm-dd. Se omite si es igual a datePublished: no aporta nada repetirla. */
  readonly dateModified?: string;
  /** Categoría legible: "Equipo". */
  readonly section?: string;
  readonly keywords?: readonly string[];
  /** Niveles entre Inicio y el artículo. Vacío = breadcrumb de dos niveles. */
  readonly breadcrumb?: readonly ArticleCrumb[];
}

/**
 * Article + BreadcrumbList para una página de prosa.
 *
 * El `publisher` reusa el @id `${SITE_URL}/#negocio` del LocalBusiness del home A
 * PROPÓSITO: así Google funde las entidades en vez de ver dos organizaciones con el
 * mismo nombre. No cambiar ese @id sin cambiar también el del home.
 *
 * Los campos opcionales se omiten cuando no vienen, de modo que una llamada sin ellos
 * produce exactamente el mismo JSON que producía guideJsonLd() —por eso la migración
 * de las tres guías rankeadas no toca el markup—.
 */
export function articleJsonLd(opts: ArticleJsonLdInput) {
  const url = `${SITE_URL}${opts.path}`;
  const modified = opts.dateModified && opts.dateModified !== opts.datePublished ? opts.dateModified : null;
  const crumbs = opts.breadcrumb ?? [];

  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: opts.headline,
      description: opts.description,
      inLanguage: "es-CL",
      datePublished: opts.datePublished,
      ...(modified ? { dateModified: modified } : {}),
      ...(opts.section ? { articleSection: opts.section } : {}),
      ...(opts.keywords?.length ? { keywords: [...opts.keywords] } : {}),
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: SITE.name, url: SITE_URL },
      publisher: {
        "@type": "LocalBusiness",
        "@id": `${SITE_URL}/#negocio`,
        name: SITE.name,
        url: SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        ...crumbs.map((c, i) => ({
          "@type": "ListItem" as const,
          position: i + 2,
          name: c.name,
          item: `${SITE_URL}${c.path}`,
        })),
        {
          "@type": "ListItem",
          position: crumbs.length + 2,
          name: opts.headline,
          item: url,
        },
      ],
    },
  ];
}
