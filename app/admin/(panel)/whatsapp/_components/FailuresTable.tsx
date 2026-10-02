import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { WhatsAppOutboxFailure } from "@/src/infrastructure/db/whatsapp-outbox-repository";
import { maskPhone, WA_EVENT_LABEL } from "../labels";

/**
 * Avisos que no llegaron. Los códigos de Meta más comunes: 131026 (el número no tiene WhatsApp),
 * 131047 (fuera de la ventana de 24 h), 131049 (Meta limitó los mensajes a ese usuario), 132001
 * (la plantilla no existe o no está aprobada en ese idioma), 132000/132012 (los parámetros no
 * calzan con la plantilla aprobada).
 */
export function FailuresTable({ rows }: { rows: WhatsAppOutboxFailure[] }) {
  return (
    <DataTable
      caption="Avisos de WhatsApp que no salieron"
      head={
        <>
          <Th>Aviso</Th>
          <Th>Destino</Th>
          <Th right>Intentos</Th>
          <Th>Código</Th>
          <Th>Creado</Th>
          <Th>Error</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.id}>
          <Td className="text-bone">{WA_EVENT_LABEL[r.event] ?? r.event}</Td>
          <Td className="whitespace-nowrap font-mono text-xs text-bone-dim">{maskPhone(r.recipient)}</Td>
          <Td right>{r.attempts}</Td>
          <Td className="font-mono text-xs text-bone-dim">{r.failedCode ?? "—"}</Td>
          <Td className="whitespace-nowrap text-bone-dim">{fmtDateTime(r.createdAt)}</Td>
          <Td className="max-w-md break-words text-xs text-bone-quiet">{r.lastError}</Td>
        </Tr>
      ))}
    </DataTable>
  );
}
