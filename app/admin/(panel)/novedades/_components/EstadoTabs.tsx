import Link from "next/link";
import { NOVEDADES_ESTADOS, novedadesHref, type NovedadesEstado, type NovedadesListQuery } from "@/src/domain/admin/novedades-list";

const LABEL: Record<NovedadesEstado, string> = { activos: "Activos", bajas: "Bajas", todos: "Todos" };

/** Filtro por estado. Mismo idioma visual que las pestañas de /admin/guia. */
export function EstadoTabs({
  query,
  counts,
}: {
  query: NovedadesListQuery;
  counts: Record<NovedadesEstado, number>;
}) {
  return (
    <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-x-6 gap-y-2 border-b hairline pb-3">
      {NOVEDADES_ESTADOS.map((e) => {
        const on = e === query.estado;
        return (
          <Link
            key={e}
            href={novedadesHref(query, { estado: e })}
            aria-current={on ? "page" : undefined}
            className={`label-sm transition-colors ${on ? "text-gold" : "text-bone-quiet hover:text-bone"}`}
          >
            {LABEL[e]}
            <span className="ml-2 font-mono text-bone-quiet">{counts[e]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
