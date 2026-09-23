import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { CATEGORY } from "./schema";
import { articleBySlug, draftsVisible, getArticles } from "./registry";

/**
 * Metadata de un artículo a partir de su slug. La usan tanto /blog/[slug] como los
 * cascarones de los artículos en raíz, que así quedan en un puñado de líneas.
 *
 * Un borrador se marca noindex aunque se pueda ver en un preview.
 */
export function articleMetadata(slug: string): Metadata {
  const a = articleBySlug(getArticles(), slug);
  if (!a) return { robots: { index: false, follow: false } };

  return pageMetadata({
    title: a.title,
    description: a.description,
    path: a.path,
    type: "article",
    publishedTime: a.publishedAt,
    ...(a.updatedAt !== a.publishedAt ? { modifiedTime: a.updatedAt } : {}),
    section: CATEGORY[a.category].label,
    tags: a.tags,
    ...(a.draft ? { noIndex: true } : {}),
  });
}

/** ¿Este artículo se puede servir en este entorno? Un borrador solo fuera de producción. */
export function articleVisible(a: { draft: boolean }): boolean {
  return !a.draft || draftsVisible();
}
