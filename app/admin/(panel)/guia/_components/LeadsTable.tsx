import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { GuideLeadRow } from "@/src/domain/admin/guia-leads-list";
import type { GuideLeadSource } from "@/src/domain/guide/lead";

/** Qué formulario de la landing convirtió (primer toque). */
const SOURCE_LABEL: Record<GuideLeadSource, string> = {
  hero: "Hero",
  fragmento: "Fragmento",
  cierre: "Cierre",
};

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
              {SOURCE_LABEL[r.source]}
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
