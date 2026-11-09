import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import type { TrialCreditRow } from "@/src/application/ports/course";
import { canExtendCredit, trialCreditState, type TrialCreditState } from "@/src/domain/course/credit";
import { formatCLP } from "@/src/domain/money/money";
import { ExtenderCreditoDialog } from "./ExtenderCreditoDialog";

const STATE_CLS: Record<TrialCreditState, string> = {
  vigente: "text-gold",
  usado: "text-bone",
  vencido: "text-bone-quiet",
  anulado: "text-bone-quiet",
};

/**
 * Las pruebas recientes y su crédito para inscribirse. El crédito nace solo al pagarse
 * la prueba (vence 7 días después de la sesión); el dueño puede extenderlo caso a caso.
 */
export function TrialsTable({ rows, now = new Date() }: { rows: TrialCreditRow[]; now?: Date }) {
  return (
    <DataTable
      minWidthClassName="min-w-[40rem]"
      head={
        <>
          <Th>Prueba</Th>
          <Th>Alumno</Th>
          <Th>Crédito</Th>
          <Th />
        </>
      }
    >
      {rows.map((r) => {
        const state = trialCreditState(r, now);
        return (
          <Tr key={r.creditId}>
            <Td className="whitespace-nowrap">
              {r.sessionStartsAt && r.reservationId ? (
                <Link href={`/admin/reservas/${r.reservationId}`} className="font-mono text-bone hover:text-gold">
                  {fmtDateTime(r.sessionStartsAt)}
                </Link>
              ) : (
                <span className="label-sm text-bone-quiet">Registrada a mano</span>
              )}
            </Td>
            <Td>
              <div className="max-w-64 truncate text-bone">{r.name ?? r.email}</div>
              {r.name && <div className="mt-0.5 max-w-64 truncate font-mono text-xs text-bone-quiet">{r.email}</div>}
            </Td>
            <Td>
              <div className={`label-sm ${STATE_CLS[state]}`}>
                {state === "vigente"
                  ? `Vigente hasta ${fmtDate(r.expiresAt)}`
                  : state === "vencido"
                    ? `Vencido el ${fmtDate(r.expiresAt)}`
                    : state === "usado"
                      ? "Usado"
                      : "Anulado (prueba devuelta)"}
              </div>
              <div className="mt-0.5 font-mono text-xs text-bone-quiet">
                {formatCLP(r.amountClp)}
                {r.extendedCount > 0 ? ` · extendido ${r.extendedCount}×` : ""}
              </div>
            </Td>
            <Td right>
              {canExtendCredit(state) && (
                <ExtenderCreditoDialog
                  creditId={r.creditId}
                  label={r.name ?? r.email}
                  amountClp={r.amountClp}
                  expiresAt={r.expiresAt}
                />
              )}
            </Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
