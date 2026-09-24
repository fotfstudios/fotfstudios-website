import type { ArticleMeta } from "./schema";

/**
 * Qué artículos enlaza el footer, que aparece en TODAS las páginas del sitio.
 *
 * Antes la lista estaba escrita a mano en components/Footer.tsx, con el resultado
 * previsible: el artículo más nuevo del sitio no estaba en ella. Acá se deriva del
 * registro, así que publicar un .mdx lo enlaza sitewide sin tocar el footer.
 *
 * Módulo PURO: recibe los artículos ya cargados y filtrados. Lo impuro (leer el disco,
 * decidir si se ven los borradores) queda en quien lo llama.
 */

/** Un artículo rankeado que todavía NO vive en content/articles/*.mdx. */
export interface PendingArticle {
  readonly path: `/${string}`;
  readonly label: string;
}

/**
 * Los rankeados que siguen siendo TSX escrito a mano y por lo tanto no están en el
 * registro. Van fijos en el footer igual: derivar solo del registro los habría borrado de
 * todas las páginas del sitio, que es justo el enlace interno que no se puede perder.
 *
 * **Cada PR de migración borra su línea de acá** y pone `featured: true` en el frontmatter
 * del .mdx nuevo. Cuando esta lista quede vacía, el archivo se borra entero.
 * lib/articles/footer-links.test.ts falla si una ruta está en los dos lados a la vez.
 */
export const PENDING_ARTICLES: readonly PendingArticle[] = [
  { path: "/cuanto-cuesta-un-curso-de-dj", label: "¿Cuánto cuesta un curso de DJ?" },
  { path: "/xdj-vs-controlador", label: "¿Controlador o equipos de club?" },
];

/**
 * Tope de artículos en el footer. No es el tope de `featured`: un artículo fijado nunca se
 * esconde, porque esconderlo sería exactamente el bug que esto viene a arreglar.
 */
export const FOOTER_ARTICLE_CAP = 6;

export interface FooterLink {
  readonly href: string;
  readonly label: string;
}

const porFechaDesc = (a: ArticleMeta, b: ArticleMeta) =>
  b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug);

/**
 * Los fijos primero (pendientes de migrar y `featured`), después los más recientes hasta
 * llegar al tope.
 *
 * `articles` ya viene sin borradores: el filtro vive en quien llama, que es quien sabe si
 * el entorno los muestra.
 */
export function footerArticleLinks(
  articles: readonly ArticleMeta[],
  pending: readonly PendingArticle[] = PENDING_ARTICLES,
  cap: number = FOOTER_ARTICLE_CAP,
): FooterLink[] {
  const fijos: FooterLink[] = [
    ...pending.map((p) => ({ href: p.path, label: p.label })),
    ...articles
      .filter((a) => a.featured)
      .sort(porFechaDesc)
      .map((a) => ({ href: a.path, label: a.title })),
  ];

  const resto = articles
    .filter((a) => !a.featured)
    .sort(porFechaDesc)
    .map((a) => ({ href: a.path, label: a.title }));

  // Los fijos entran completos aunque pasen el tope; el resto solo llena lo que sobra.
  return [...fijos, ...resto.slice(0, Math.max(0, cap - fijos.length))];
}
