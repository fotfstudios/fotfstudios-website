import Link from "next/link";
import { CATEGORY, type ArticleMeta } from "@/lib/articles/schema";
import { formatArticleDate } from "@/lib/articles/format";

/** Una fila del listado: fecha y categoría en mono, título en display, bajada en bone-dim. */
export function ArticleCard({ article }: { article: ArticleMeta }) {
  return (
    <article className="border-t hairline py-8">
      <p className="label-sm text-bone-mute">
        <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        <span aria-hidden="true"> · </span>
        {CATEGORY[article.category].label}
        {article.draft ? <span className="text-gold"> · Borrador</span> : null}
      </p>
      <h2 className="font-display mt-2 text-bone" style={{ fontSize: "clamp(1.4rem,4vw,2rem)" }}>
        <Link href={article.path} className="transition-colors hover:text-gold">
          {article.title}
        </Link>
      </h2>
      <p className="mt-3 leading-relaxed text-bone-dim">{article.excerpt}</p>
    </article>
  );
}
