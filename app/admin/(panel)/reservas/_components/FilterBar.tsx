import Link from "next/link";
import {
  reservasHref,
  type ReservaTab,
  type ReservaTiempo,
  type ReservasListQuery,
} from "@/src/domain/admin/reservas-list";
import { SearchBox } from "./SearchBox";
import { SortSelect } from "./SortSelect";

const TABS: { key: ReservaTab; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "confirmadas", label: "Confirmadas" },
  { key: "espera", label: "En espera" },
  { key: "canceladas", label: "Canceladas" },
  { key: "bloqueos", label: "Bloqueos" },
];

const TIEMPOS: { key: ReservaTiempo; label: string }[] = [
  { key: "proximas", label: "Próximas" },
  { key: "pasadas", label: "Pasadas" },
  { key: "todas", label: "Todas" },
];

/** Tabs por estado (con conteos vivos), rango temporal, búsqueda y orden — todo estado en la URL. */
export function FilterBar({
  query,
  counts,
}: {
  query: ReservasListQuery;
  counts: Record<ReservaTab, number>;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <nav aria-label="Filtrar por estado" className="flex flex-wrap border-b hairline">
        {TABS.map((t) => {
          const active = query.estado === t.key;
          return (
            <Link
              key={t.key}
              href={reservasHref(query, { estado: t.key })}
              aria-current={active ? "page" : undefined}
              className={`label-sm -mb-px border-b-2 px-3 py-2 transition-colors ${
                active ? "border-gold text-gold" : "border-transparent text-bone-mute hover:text-bone"
              }`}
            >
              {t.label} <span className={active ? "text-gold/70" : "text-bone-mute/60"}>{counts[t.key]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filtrar por tiempo" className="flex divide-x divide-ink-line border hairline">
          {TIEMPOS.map((t) => {
            const active = query.tiempo === t.key;
            return (
              <Link
                key={t.key}
                href={reservasHref(query, { tiempo: t.key })}
                aria-current={active ? "page" : undefined}
                className={`label-sm px-3 py-2.5 transition-colors ${
                  active ? "bg-gold text-ink" : "text-bone-dim hover:text-gold"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <SearchBox defaultValue={query.q} />
        <SortSelect value={query.orden} />
      </div>
    </div>
  );
}
