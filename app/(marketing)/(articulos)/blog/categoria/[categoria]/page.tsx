import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/article/ArticleCard";
import { CategoryChips } from "@/components/article/CategoryChips";
import {
  articlesByCategory,
  categoryCounts,
  draftsVisible,
  getArticles,
  publishedArticles,
} from "@/lib/articles/registry";
import { ARTICLE_CATEGORIES, CATEGORY, type ArticleCategory } from "@/lib/articles/schema";
import { canonicalUrl, pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * Categorías como RUTAS ESTÁTICAS, no como ?categoria=. Un query param es un duplicado
 * parametrizado de /blog: Google lo canonicaliza y lo descarta, no tiene título ni H1
 * propios y no puede acumular enlaces. Una ruta estática sí rankea.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICLE_CATEGORIES.map((categoria) => ({ categoria }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoria: string }>;
}): Promise<Metadata> {
  const { categoria } = await params;
  const c = CATEGORY[categoria as ArticleCategory];
  if (!c) return { robots: { index: false, follow: false } };
  return pageMetadata({ title: c.title, description: c.description, path: `/blog/categoria/${categoria}` });
}

export default async function CategoriaPage({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  if (!(ARTICLE_CATEGORIES as readonly string[]).includes(categoria)) notFound();
  const cat = categoria as ArticleCategory;
  const copy = CATEGORY[cat];

  const all = getArticles();
  const visibles = publishedArticles(all, draftsVisible());
  const articles = articlesByCategory(visibles, cat);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: canonicalUrl("/blog") },
      { "@type": "ListItem", position: 3, name: copy.label, item: canonicalUrl(`/blog/categoria/${cat}`) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="label mt-10 text-gold">{copy.label}</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        {copy.title}
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-bone-dim">{copy.description}</p>

      <CategoryChips counts={categoryCounts(visibles)} active={cat} />

      {articles.length === 0 ? (
        <p className="mt-12 border-t hairline pt-10 leading-relaxed text-bone-dim">
          Todavía no hay artículos en esta categoría.
        </p>
      ) : (
        <div className="mt-8">
          {articles.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      )}
      <p className="mt-12">
        <Link href="/blog" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← Todos los artículos
        </Link>
      </p>
    </>
  );
}
