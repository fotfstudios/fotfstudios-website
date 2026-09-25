import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { NewsletterSubscriberRow } from "@/src/domain/admin/novedades-list";

/** De qué formulario llegó el alta. Un valor desconocido se muestra crudo. */
const SOURCE_LABEL: Record<string, string> = { curso_dj: "Curso DJ" };

export function SuscriptoresTable({ rows }: { rows: NewsletterSubscriberRow[] }) {
  return (
    <DataTable
      caption="Suscriptores del newsletter"
      head={
        <>
          <Th>Email</Th>
          <Th>Origen</Th>
          <Th right>Altas</Th>
          <Th>Desde</Th>
          <Th>Estado</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.id}>
          <Td className="font-mono text-bone">{r.email}</Td>
          <Td>
            <span className="inline-flex items-center border hairline px-2 py-0.5 label-sm text-bone-dim">
              {SOURCE_LABEL[r.source] ?? r.source}
            </span>
          </Td>
          <Td right className="font-mono text-bone-dim">
            {r.requestCount}
          </Td>
          <Td className="text-bone-dim">{fmtDateTime(r.consentAt)}</Td>
          <Td className={r.unsubscribedAt ? "text-bone-quiet" : "text-gold"}>
            {r.unsubscribedAt ? `Baja · ${fmtDateTime(r.unsubscribedAt)}` : "Activo"}
          </Td>
        </Tr>
      ))}
    </DataTable>
  );
}
