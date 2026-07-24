import Link from "next/link";
import {
  POSTULACION_TABS,
  postulacionesHref,
  type PostulacionTab,
  type PostulacionesListQuery,
} from "@/src/domain/admin/postulaciones-list";

const LABEL: Record<PostulacionTab, string> = {
  nuevas: "Nuevas",
  contactadas: "Contactadas",
  descartadas: "Descartadas",
  todas: "Todas",
};

/** Tabs por estado con conteos vivos; todo el estado vive en la URL. */
export function Tabs({
  query,
  counts,
}: {
  query: PostulacionesListQuery;
  counts: Record<PostulacionTab, number>;
}) {
  return (
    <nav aria-label="Filtrar por estado" className="mt-8 flex flex-wrap border-b hairline">
      {POSTULACION_TABS.map((tab) => {
        const active = query.estado === tab;
        return (
          <Link
            key={tab}
            href={postulacionesHref(query, { estado: tab })}
            aria-current={active ? "page" : undefined}
            className={`label-sm -mb-px border-b-2 px-3 py-2 transition-colors ${
              active ? "border-gold text-gold" : "border-transparent text-bone-mute hover:text-bone"
            }`}
          >
            {LABEL[tab]} <span className={active ? "text-gold/70" : "text-bone-mute/60"}>{counts[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
