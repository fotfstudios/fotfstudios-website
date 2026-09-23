import { CATEGORY, type ArticleMeta } from "@/lib/articles/schema";
import { formatArticleDate } from "@/lib/articles/format";

/**
 * El encabezado del artículo. El H1 sale del frontmatter, NO del cuerpo MDX — por eso
 * el mapa de MDX no define `h1` y el registro rechaza un "# " en el cuerpo.
 */
export function ArticleHeader({ article }: { article: ArticleMeta }) {
  return (
    <header>
      <p className="label mt-10 text-gold">{CATEGORY[article.category].label}</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        {article.title}
      </h1>
      {article.lede ? (
        <p className="font-editorial mt-4 max-w-xl text-xl text-bone-dim">{article.lede}</p>
      ) : null}
      <p className="label-sm mt-6 text-bone-mute">
        <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
        {article.updatedAt !== article.publishedAt ? (
          <>
            <span aria-hidden="true"> · </span>
            actualizado el <time dateTime={article.updatedAt}>{formatArticleDate(article.updatedAt)}</time>
          </>
        ) : null}
      </p>
    </header>
  );
}
