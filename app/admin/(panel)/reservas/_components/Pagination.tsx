import Link from "next/link";
import { reservasHref, type ReservasListQuery } from "@/src/domain/admin/reservas-list";

const arrow = "label border hairline px-4 py-2 text-bone-dim transition-colors hover:text-gold";

/** Pie de paginación: «Mostrando X–Y de Z» + ‹ › que conservan los filtros de la URL. */
export function Pagination({ query, total }: { query: ReservasListQuery; total: number }) {
  if (total <= query.perPage) return null;
  const pageCount = Math.max(1, Math.ceil(total / query.perPage));
  const from = (query.page - 1) * query.perPage + 1;
  const to = Math.min(query.page * query.perPage, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p aria-live="polite" className="label-sm text-bone-mute">
        Mostrando {from}–{to} de {total}
      </p>
      <nav aria-label="Paginación" className="flex items-center gap-2">
        {query.page > 1 ? (
          <Link aria-label="Página anterior" href={reservasHref(query, { page: query.page - 1 })} className={arrow}>
            ‹
          </Link>
        ) : (
          <span aria-hidden className={`${arrow} pointer-events-none opacity-30`}>
            ‹
          </span>
        )}
        <span className="label-sm px-2 text-bone-dim">
          Página {query.page} de {pageCount}
        </span>
        {query.page < pageCount ? (
          <Link aria-label="Página siguiente" href={reservasHref(query, { page: query.page + 1 })} className={arrow}>
            ›
          </Link>
        ) : (
          <span aria-hidden className={`${arrow} pointer-events-none opacity-30`}>
            ›
          </span>
        )}
      </nav>
    </div>
  );
}
