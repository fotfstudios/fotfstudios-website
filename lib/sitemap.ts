import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "@/lib/articles/schema";
import type { ArticleMeta } from "@/lib/articles/schema";

/**
 * El sitemap, como datos.
 *
 * Vivía como un array literal de diez entradas dentro de app/sitemap.ts, donde vitest no
 * lo ve (vitest.config.ts no recoge app/**). A 2–4 artículos por mes, mantenerlo a mano se
 * queda atrás en semanas. Acá la parte fija sigue siendo una tabla escrita a mano —las
 * prioridades están afinadas y se conservan tal cual— y los artículos se derivan.
 */

export interface SitemapEntry {
  readonly path: string;
  readonly priority: number;
  readonly changeFrequency: "weekly" | "monthly" | "yearly";
  /** yyyy-mm-dd. Si falta se usa la fecha del build, que es el comportamiento anterior. */
  readonly lastModified?: string;
}

/**
 * Páginas fijas. Las ocho prioridades vienen del sitemap original sin tocar; /blog es la
 * única entrada nueva.
 *
 * Los tres artículos en raíz (/aprender-dj, /cuanto-cuesta-un-curso-de-dj,
 * /xdj-vs-controlador) siguen acá con su 0.6 mientras sean TSX. Cuando se migren a MDX
 * salen de esta tabla y entran solos por ARTICLE_PRIORITY, que vale lo mismo: ninguna URL
 * cambia de lugar ni de prioridad en ningún momento.
 */
export const STATIC_ROUTES: readonly SitemapEntry[] = [
  { path: "/", priority: 1, changeFrequency: "monthly" },
  { path: "/curso-dj", priority: 0.8, changeFrequency: "monthly" },
  { path: "/grabacion", priority: 0.8, changeFrequency: "monthly" },
  { path: "/guia-dj", priority: 0.7, changeFrequency: "monthly" },
  { path: "/guia-pendrive-dj", priority: 0.7, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
  { path: "/cuanto-cuesta-un-curso-de-dj", priority: 0.6, changeFrequency: "monthly" },
  { path: "/xdj-vs-controlador", priority: 0.6, changeFrequency: "monthly" },
  { path: "/unete", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacidad", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terminos", priority: 0.3, changeFrequency: "yearly" },
] as const;

/** La misma que tenían las tres guías en raíz: migrarlas no las mueve de lugar. */
export const ARTICLE_PRIORITY = 0.6;
export const CATEGORY_PRIORITY = 0.4;

/**
 * PURO: recibe los artículos y devuelve el sitemap. `now` entra como argumento para que
 * la prueba no dependa del reloj.
 *
 * Una categoría sin artículos NO entra: una página vacía en el sitemap es pedirle a Google
 * que indexe contenido delgado.
 */
export function buildSitemap(articles: readonly ArticleMeta[], now: Date): MetadataRoute.Sitemap {
  const fijas = STATIC_ROUTES.map((e) => ({
    url: `${SITE_URL}${e.path === "/" ? "" : e.path}`,
    lastModified: e.lastModified ? new Date(`${e.lastModified}T00:00:00Z`) : now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));

  const yaListadas = new Set(STATIC_ROUTES.map((e) => e.path));

  const piezas = articles
    .filter((a) => !yaListadas.has(a.path))
    .map((a) => ({
      url: `${SITE_URL}${a.path}`,
      // La fecha real del contenido, no la del build.
      lastModified: new Date(`${a.updatedAt}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: ARTICLE_PRIORITY,
    }));

  const categorias = ARTICLE_CATEGORIES.filter((c) => articles.some((a) => a.category === c)).map(
    (c: ArticleCategory) => ({
      url: `${SITE_URL}/blog/categoria/${c}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: CATEGORY_PRIORITY,
    }),
  );

  return [...fijas, ...piezas, ...categorias];
}
