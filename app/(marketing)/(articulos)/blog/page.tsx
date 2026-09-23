import type { Metadata } from "next";
import { ArticleCard } from "@/components/article/ArticleCard";
import { CategoryChips } from "@/components/article/CategoryChips";
import { categoryCounts, draftsVisible, getArticles, publishedArticles } from "@/lib/articles/registry";
import { canonicalUrl, pageMetadata } from "@/lib/seo";
import { SITE, SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "Artículos sobre cómo aprender a ser DJ, qué equipo comprar y cuánto cuesta de verdad. Escritos en la sala, no copiados de internet.";

export const metadata: Metadata = pageMetadata({
  title: "Artículos para DJs que están partiendo",
  description: DESCRIPTION,
  path: "/blog",
});

export default function BlogIndexPage() {
  const all = getArticles();
  const articles = publishedArticles(all, draftsVisible());

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Artículos para DJs que están partiendo",
      description: DESCRIPTION,
      inLanguage: "es-CL",
      url: canonicalUrl("/blog"),
      publisher: { "@type": "LocalBusiness", "@id": `${SITE_URL}/#negocio`, name: SITE.name, url: SITE_URL },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: articles.map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: a.title,
          url: canonicalUrl(a.path),
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: canonicalUrl("/blog") },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="label mt-10 text-gold">Artículos</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        Para DJs que están partiendo
      </h1>
      <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">
        Lo que nos preguntan en la sala, escrito para que no tengas que preguntarlo.
      </p>

      <CategoryChips counts={categoryCounts(articles)} />

      {articles.length === 0 ? (
        <p className="mt-12 border-t hairline pt-10 leading-relaxed text-bone-dim">
          Todavía no hay artículos publicados. Vuelve pronto.
        </p>
      ) : (
        <div className="mt-8">
          {articles.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      )}
    </>
  );
}
