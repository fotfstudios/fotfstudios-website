import type { Metadata } from "next";
import { ArticleView } from "@/components/article/ArticleView";
import { articleMetadata } from "@/lib/articles/metadata";
import { blogSlugs, draftsVisible, getArticles, publishedArticles } from "@/lib/articles/registry";

/** Un slug que no existe da 404 limpio, sin render dinámico. */
export const dynamicParams = false;

export function generateStaticParams() {
  // blogSlugs excluye los artículos con `path` override: esos viven en su ruta de raíz
  // y generarlos acá también sería contenido duplicado.
  return blogSlugs(publishedArticles(getArticles(), draftsVisible())).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return articleMetadata(slug);
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArticleView slug={slug} />;
}
