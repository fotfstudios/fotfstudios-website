import Link from "next/link";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { fmtDateTime } from "@/components/admin/format";
import type { SyncFailure } from "@/src/application/ports/calendar";

/** Filas que Google rechazó: se reintentan solas con backoff (hasta 1 h) o con "Sincronizar ahora". */
export function FailuresTable({ rows }: { rows: SyncFailure[] }) {
  return (
    <DataTable
      caption="Reservas que no se pudieron sincronizar"
      head={
        <>
          <Th>Reserva</Th>
          <Th>Operación</Th>
          <Th right>Intentos</Th>
          <Th>Próximo intento</Th>
          <Th>Error</Th>
        </>
      }
    >
      {rows.map((r) => (
        <Tr key={r.reservationId}>
          <Td>
            {r.op === "delete" ? (
              <span className="font-mono text-xs text-bone-dim">{r.reservationId.slice(0, 8)}</span>
            ) : (
              <Link href={`/admin/reservas/${r.reservationId}`} className="font-mono text-xs text-gold hover:text-bone">
                {r.reservationId.slice(0, 8)}
              </Link>
            )}
          </Td>
          <Td className="text-bone-dim">{r.op === "delete" ? "Borrar" : "Publicar"}</Td>
          <Td right>{r.attempts}</Td>
          <Td className="whitespace-nowrap text-bone-dim">{fmtDateTime(r.nextAttemptAt)}</Td>
          <Td className="max-w-md break-words text-xs text-bone-quiet">{r.lastError}</Td>
        </Tr>
      ))}
    </DataTable>
  );
}
