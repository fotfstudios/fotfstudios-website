import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { GuideLeadRow } from "@/src/domain/admin/guia-leads-list";
import { GUIDES, isGuideSlug } from "@/lib/guides";

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

export function LeadsTable({ rows }: { rows: GuideLeadRow[] }) {
  return (
    <DataTable
      caption="Leads de la guía"
      head={
        <>
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
