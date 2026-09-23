import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLE_MODULES } from "@/content/articles/modules";
import { articleJsonLd } from "@/lib/articles/jsonld";
import { articleVisible } from "@/lib/articles/metadata";
import { articleBySlug, getArticles, relatedArticles } from "@/lib/articles/registry";
import { CATEGORY } from "@/lib/articles/schema";
import { ArticleHeader } from "./ArticleHeader";
import { GuiaCta } from "./GuiaCta";
import { RelatedArticles } from "./RelatedArticles";

/**
 * Un artículo completo. La comparten /blog/[slug] y los cascarones de los artículos en
 * raíz, que están rankeados y conservan su URL — de ahí que el breadcrumb se arme desde
 * `legacyPath` y no desde una ruta fija.
 */
export async function ArticleView({ slug }: { slug: string }) {
  const all = getArticles();
  const article = articleBySlug(all, slug);
  if (!article || !articleVisible(article)) notFound();

  const load = ARTICLE_MODULES[slug as keyof typeof ARTICLE_MODULES];
  if (!load) notFound();
  const { default: Body } = await load();

  // Un artículo en raíz cuelga de Inicio; uno de /blog pasa por el índice.
  const jsonLd = articleJsonLd({
    path: article.path,
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    section: CATEGORY[article.category].label,
    keywords: article.tags,
    breadcrumb: article.legacyPath ? [] : [{ name: "Blog", path: "/blog" }],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ArticleHeader article={article} />
      <div className="mt-10">
        <Body />
      </div>
      <GuiaCta guide={article.guide} />
      <RelatedArticles articles={relatedArticles(all, article)} />
      <p className="mt-12">
        <Link href="/blog" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← Todos los artículos
        </Link>
      </p>
    </>
  );
}
