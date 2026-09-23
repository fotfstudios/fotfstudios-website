import { headlineSize, splitHeadline } from "@/lib/articles/headline";
import { articleBySlug, blogSlugs, draftsVisible, getArticles, publishedArticles } from "@/lib/articles/registry";
import { CATEGORY } from "@/lib/articles/schema";
import { ogPhotoFor } from "@/lib/articles/og-photo";
import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Artículo de FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return blogSlugs(publishedArticles(getArticles(), draftsVisible())).map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug(getArticles(), slug);
  const lines = splitHeadline(article?.title ?? "Artículo");
  return ogImage({
    photo: ogPhotoFor(article?.category),
    lines,
    fontSize: headlineSize(lines),
    footLeft: article ? `${CATEGORY[article.category].label.toUpperCase()} · FOTF STUDIOS` : "FOTF STUDIOS",
  });
}
