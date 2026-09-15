import Link from "next/link";
import { fmtDateTime } from "@/components/admin/format";
import { BlockedFolioControl, FolioForm, type RecordFolioAction } from "@/components/admin/tax-docs/FolioForm";
import { stepAmounts, stepKindLabel, stepReference, stepWhen } from "@/components/admin/tax-docs/step-copy";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { formatCLP } from "@/src/domain/money/money";
import { blockedNcMessage, type TaxDocStep } from "@/src/domain/tax/tax-doc-steps";
import type { PendingTaxDocGroup } from "@/src/infrastructure/db/admin-repository";

/** Un pedido con sus pasos pendientes ya derivados (el page los filtra). */
export interface QueueGroup {
  group: PendingTaxDocGroup;
  steps: TaxDocStep[];
}

/** Quién y cuándo, para ubicar el pedido sin abrir la ficha. */
function groupTitle(g: PendingTaxDocGroup): { title: string; sub: string | null } {
  const c = g.context;
  if (c.kind === "reserva") return { title: c.customerName ?? "Sin nombre", sub: fmtDateTime(c.startsAt) };
  if (c.kind === "curso") return { title: c.studentName, sub: `Curso ${c.generationCode}` };
  return { title: c.customerName ?? "Pedido sin ficha", sub: null };
}

function groupHref(g: PendingTaxDocGroup): string | null {
  const c = g.context;
  if (c.kind === "reserva") return `/admin/reservas/${c.reservationId}`;
  if (c.kind === "curso") return `/admin/curso/inscripciones/${c.enrollmentId}`;
  return null;
}

/**
 * La cola SII como tabla, igual que las demás listas del admin: una fila por
 * documento pendiente, la celda del cliente abarca todas las filas de su pedido
 * (así la cadena NC → saldo se lee junta) y el folio se registra en la misma fila.
 * Los estados y el copy salen del derivador; acá solo se distribuyen en columnas.
 */
export function QueueTable({ groups, action, backPath }: { groups: QueueGroup[]; action: RecordFolioAction; backPath: string }) {
  return (
    <DataTable
      caption="Documentos tributarios por emitir en el SII"
      minWidthClassName="min-w-[52rem]"
      head={
        <>
          <Th>Cliente</Th>
          <Th>Documento</Th>
          <Th right>Monto</Th>
          <Th>Estado</Th>
          <Th>Folio</Th>
        </>
      }
    >
      {groups.map(({ group, steps }, gi) =>
        steps.map((s, i) => {
          const first = i === 0;
          const { title, sub } = groupTitle(group);
          const href = groupHref(group);
          const reference = stepReference(s);
          return (
            <Tr key={s.id} className={first && gi > 0 ? "border-t border-ink-edge" : ""}>
              {first && (
                <Td rowSpan={steps.length} className="align-top">
                  <p className="text-bone">{title}</p>
                  {sub && <p className="label-sm mt-1 text-bone-quiet">{sub}</p>}
                  {href && (
                    <Link href={href} className="label-sm mt-2 inline-block text-gold transition-colors hover:text-bone">
                      Ir a la ficha
                    </Link>
                  )}
                </Td>
              )}
              <Td className="max-w-xs">
                <p className="text-bone">{stepKindLabel(s)}</p>
                {reference && <p className="mt-0.5 text-bone-dim">{reference}</p>}
                <p className="label-sm mt-1 text-bone-quiet">{stepWhen(s)}</p>
                {s.note && <p className="mt-1.5 text-xs text-bone-dim">{s.note}</p>}
                {s.razonReferencia && s.state === "por_emitir" && (
                  <p className="mt-1.5 flex items-start gap-2 text-bone-quiet">
                    <span className="font-mono text-xs text-bone-dim">{s.razonReferencia}</span>
                    <CopyButton value={s.razonReferencia} label="Razón copiada" />
                  </p>
                )}
              </Td>
              <Td right className="align-top">
                <p className="whitespace-nowrap font-mono text-bone">{formatCLP(s.total)}</p>
                <p className="label-sm mt-1 text-bone-quiet">{stepAmounts(s)}</p>
              </Td>
              <Td className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <StatusPill status={s.state} />
                  {s.atrasada && <StatusPill status="atrasada" />}
                </div>
              </Td>
              <Td className="whitespace-nowrap">
                {s.state === "bloqueada" ? (
                  <>
                    <BlockedFolioControl />
                    <p className="mt-1.5 max-w-xs whitespace-normal text-xs text-bone-dim">{blockedNcMessage(s.parentTotal ?? 0)}</p>
                  </>
                ) : (
                  <FolioForm docId={s.id} action={action} backPath={backPath} />
                )}
              </Td>
            </Tr>
          );
        }),
      )}
    </DataTable>
  );
}
