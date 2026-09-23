import { ARTICLE_CATEGORIES, CATEGORY, type ArticleCategory } from "@/lib/articles/schema";
import { headlineSize, splitHeadline } from "@/lib/articles/headline";
import { ogPhotoFor } from "@/lib/articles/og-photo";
import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Artículos por categoría — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return ARTICLE_CATEGORIES.map((categoria) => ({ categoria }));
}

export default async function Image({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const copy = CATEGORY[categoria as ArticleCategory];
  const lines = splitHeadline(copy?.title ?? "Artículos");
  return ogImage({
    photo: ogPhotoFor(categoria as ArticleCategory),
    lines,
    fontSize: headlineSize(lines),
    footLeft: `${(copy?.label ?? "Artículos").toUpperCase()} · FOTFSTUDIOS.CL/BLOG`,
  });
}
