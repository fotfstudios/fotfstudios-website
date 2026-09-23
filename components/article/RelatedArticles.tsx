import Link from "next/link";
import { articleHref } from "@/lib/articles/href";
import type { ArticleMeta } from "@/lib/articles/schema";

/** Seguir leyendo. No se renderiza si no hay nada que ofrecer. */
export function RelatedArticles({ articles }: { articles: readonly ArticleMeta[] }) {
  if (articles.length === 0) return null;
  return (
    <nav aria-label="Seguir leyendo" className="mt-16 border-t hairline pt-10">
      <p className="label text-bone-mute">Seguir leyendo</p>
      <ul className="mt-4 space-y-3">
        {articles.map((a) => (
          <li key={a.slug}>
            <Link href={articleHref(a.path)} className="font-display text-xl text-bone transition-colors hover:text-gold">
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
