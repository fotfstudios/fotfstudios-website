import Link from "next/link";
import { GUIDES, GUIDE_SLUGS } from "@/lib/guides";
import { guiaLeadsHref, type GuiaLeadsListQuery } from "@/src/domain/admin/guia-leads-list";

/**
 * Filtro por guía. Mismo idioma visual que las pestañas de /admin/curso/solicitudes.
 *
 * No se renderiza con una sola guía: una pestaña "Todas" al lado de una única opción no
 * filtra nada y solo ocupa una línea.
 */
export function GuiaTabs({
  query,
  counts,
  grandTotal,
}: {
  query: GuiaLeadsListQuery;
  counts: Record<string, number>;
  grandTotal: number;
}) {
  if (GUIDE_SLUGS.length < 2) return null;

  return (
    <nav aria-label="Filtrar por guía" className="flex flex-wrap gap-x-6 gap-y-2 border-b hairline pb-3">
      <Link
        href={guiaLeadsHref(query, { guide: null })}
        aria-current={query.guide ? undefined : "page"}
        className={`label-sm transition-colors ${query.guide ? "text-bone-quiet hover:text-bone" : "text-gold"}`}
      >
        Todas
        <span className="ml-2 font-mono text-bone-quiet">{grandTotal}</span>
      </Link>
      {GUIDE_SLUGS.map((slug) => {
        const on = slug === query.guide;
        return (
          <Link
            key={slug}
            href={guiaLeadsHref(query, { guide: slug })}
            aria-current={on ? "page" : undefined}
            className={`label-sm transition-colors ${on ? "text-gold" : "text-bone-quiet hover:text-bone"}`}
          >
            {GUIDES[slug].title}
            <span className="ml-2 font-mono text-bone-quiet">{counts[slug] ?? 0}</span>
          </Link>
        );
      })}
    </nav>
  );
}
