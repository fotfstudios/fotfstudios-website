import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { GuideLeadRow } from "@/src/domain/admin/guia-leads-list";
import { GUIDES, GUIDE_SLUGS, isGuideSlug } from "@/lib/guides";

/**
 * Qué formulario de la landing convirtió (primer toque).
 *
 * La etiqueta la declara cada guía en lib/guides.ts: antes vivía acá, y con varias guías
 * eso eran tres fuentes de verdad para lo mismo. Si la guía salió del registro, se muestra
 * el valor crudo en vez de romper la tabla.
 */
function sourceLabel(guideSlug: string, source: string): string {
  if (!isGuideSlug(guideSlug)) return source;
  return GUIDES[guideSlug].sources.find((s) => s.id === source)?.label ?? source;
}

/** El título de la guía, o el slug crudo si salió del registro con leads vivos. */
const guideLabel = (slug: string): string => (isGuideSlug(slug) ? GUIDES[slug].title : slug);

export function LeadsTable({ rows }: { rows: GuideLeadRow[] }) {
  // Con una sola guía la columna no informa nada y se come ancho: seis columnas ya es el
  // límite cómodo de esta tabla.
  const showGuide = GUIDE_SLUGS.length > 1;
  return (
    <DataTable
      caption="Leads de las guías"
      head={
        <>
          {showGuide ? <Th>Guía</Th> : null}
          <Th>Email</Th>
          <Th>Origen</Th>
          <Th right>Pedidos</Th>
          <Th>Primer pedido</Th>
          <Th>Descargó</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.id}>
          {showGuide ? <Td className="text-bone-dim">{guideLabel(r.guideSlug)}</Td> : null}
          <Td className="font-mono text-bone">{r.email}</Td>
          <Td>
            <span className="inline-flex items-center border hairline px-2 py-0.5 label-sm text-bone-dim">
              {sourceLabel(r.guideSlug, r.source)}
            </span>
          </Td>
          <Td right className="font-mono text-bone-dim">
            {r.requestCount}
          </Td>
          <Td className="text-bone-dim">{fmtDateTime(r.createdAt)}</Td>
          <Td className={r.lastDownloadedAt ? "text-gold" : "text-bone-quiet"}>
            {r.lastDownloadedAt ? fmtDateTime(r.lastDownloadedAt) : "—"}
          </Td>
        </Tr>
      ))}
    </DataTable>
  );
}
