import Link from "next/link";
import { ARTICLE_CATEGORIES, CATEGORY, type ArticleCategory } from "@/lib/articles/schema";

/**
 * Filtro por categoría. Son ENLACES, no botones: es un server component sin una línea de
 * JavaScript, y cada categoría es una URL propia que puede rankear y recibir enlaces.
 * Las categorías sin artículos no se muestran — una página vacía es contenido delgado.
 */
export function CategoryChips({
  counts,
  active,
}: {
  counts: readonly { category: ArticleCategory; count: number }[];
  active?: ArticleCategory;
}) {
  const conArticulos = ARTICLE_CATEGORIES.filter(
    (c) => (counts.find((x) => x.category === c)?.count ?? 0) > 0,
  );
  if (conArticulos.length === 0) return null;

  return (
    <nav aria-label="Filtrar por categoría" className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
      <Link
        href="/blog"
        aria-current={active ? undefined : "page"}
        className={`label-sm inline-flex min-h-11 items-center transition-colors hover:text-gold ${
          active ? "text-bone-mute" : "text-gold"
        }`}
      >
        Todo
      </Link>
      {conArticulos.map((c) => (
        <Link
          key={c}
          href={`/blog/categoria/${c}`}
          aria-current={active === c ? "page" : undefined}
          className={`label-sm inline-flex min-h-11 items-center transition-colors hover:text-gold ${
            active === c ? "text-gold" : "text-bone-mute"
          }`}
        >
          {CATEGORY[c].label}
        </Link>
      ))}
    </nav>
  );
}
