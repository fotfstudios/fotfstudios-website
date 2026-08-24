import Link from "next/link";
import {
  SOLICITUD_TABS,
  type SolicitudTab,
  type SolicitudesListQuery,
  solicitudesHref,
} from "@/src/domain/admin/curso-solicitudes-list";

const LABEL: Record<SolicitudTab, string> = {
  nuevas: "Nuevas",
  contactadas: "Contactadas",
  inscritas: "Inscritas",
  descartadas: "Descartadas",
  todas: "Todas",
};

export function Tabs({
  query,
  counts,
}: {
  query: SolicitudesListQuery;
  counts: Record<SolicitudTab, number>;
}) {
  return (
    <nav aria-label="Filtrar solicitudes" className="flex flex-wrap gap-x-6 gap-y-2 border-b hairline pb-3">
      {SOLICITUD_TABS.map((tab) => {
        const on = tab === query.estado;
        return (
          <Link
            key={tab}
            href={solicitudesHref(query, { estado: tab })}
            aria-current={on ? "page" : undefined}
            className={`label-sm transition-colors ${on ? "text-gold" : "text-bone-mute hover:text-bone"}`}
          >
            {LABEL[tab]}
            <span className="ml-2 font-mono text-bone-mute/70">{counts[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
