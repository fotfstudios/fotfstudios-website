import Link from "next/link";
import { type SolicitudesListQuery, solicitudesHref } from "@/src/domain/admin/curso-solicitudes-list";

export function Pagination({ query, total }: { query: SolicitudesListQuery; total: number }) {
  if (total <= query.perPage) return null;
  const from = (query.page - 1) * query.perPage + 1;
  const to = Math.min(query.page * query.perPage, total);
  const last = Math.ceil(total / query.perPage);

  const arrow = "label-sm px-2 py-1 transition-colors";
  return (
    <div className="mt-6 flex items-center justify-between">
      <p aria-live="polite" className="label-sm text-bone-mute">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        {query.page > 1 ? (
          <Link href={solicitudesHref(query, { page: query.page - 1 })} className={`${arrow} text-gold hover:text-bone`}>
            ‹ Anterior
          </Link>
        ) : (
          <span className={`${arrow} text-bone-mute/40`}>‹ Anterior</span>
        )}
        {query.page < last ? (
          <Link href={solicitudesHref(query, { page: query.page + 1 })} className={`${arrow} text-gold hover:text-bone`}>
            Siguiente ›
          </Link>
        ) : (
          <span className={`${arrow} text-bone-mute/40`}>Siguiente ›</span>
        )}
      </div>
    </div>
  );
}
