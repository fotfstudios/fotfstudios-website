import { headlineSize, splitHeadline } from "@/lib/articles/headline";
import { ogPhotoFor } from "@/lib/articles/og-photo";
import { articleBySlug, getArticles } from "@/lib/articles/registry";
import { CATEGORY } from "@/lib/articles/schema";
import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Cómo aprender a ser DJ desde cero — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const article = articleBySlug(getArticles(), "aprender-dj");
  const lines = splitHeadline(article?.title ?? "Aprender a ser DJ");
  return ogImage({
    photo: ogPhotoFor(article?.category),
    lines,
    fontSize: headlineSize(lines),
    footLeft: article ? `${CATEGORY[article.category].label.toUpperCase()} · FOTF STUDIOS` : "FOTF STUDIOS",
  });
}
