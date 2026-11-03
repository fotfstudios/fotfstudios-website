import { DateTime } from "luxon";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { LeadListRow } from "@/src/domain/admin/leads-list";
import { StageSelect } from "./StageSelect";
import { AssigneeSelect } from "./AssigneeSelect";
import { NurturePill } from "./NurturePill";
import { enrollLeadAction, pauseLeadAction } from "../actions";

const fmtDate = (iso: string) =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("d LLL yyyy");

export function LeadsTable({
  rows,
  members,
}: {
  rows: LeadListRow[];
  members: { id: string; email: string }[];
}) {
  return (
    <DataTable
      minWidthClassName="min-w-[72rem]"
      head={
        <>
          <Th>Alta</Th>
          <Th>Contacto</Th>
          <Th>Origen</Th>
          <Th>Etapa</Th>
          <Th>Asignado</Th>
          <Th>Nurture</Th>
          <Th>Toques</Th>
          <Th right>Acciones</Th>
        </>
      }
    >
      {rows.map((r) => {
        const enrolled = r.consentAt && !r.unsubscribedAt;
        return (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap label-sm text-bone-quiet">{fmtDate(r.createdAt)}</Td>

            <Td>
              <Link href={`/admin/leads/${r.id}`} className="text-gold transition-colors hover:text-gold-deep">
                {r.name ?? r.email}
              </Link>
              {r.name && <p className="label-sm mt-0.5 text-bone-quiet">{r.email}</p>}
              {r.phone && <p className="label-sm text-bone-quiet">{r.phone}</p>}
            </Td>

            <Td className="label-sm text-bone-dim">{r.source ?? "—"}</Td>

            <Td>
              <StageSelect email={r.email} stage={r.stage} />
            </Td>

            <Td>
              <AssigneeSelect email={r.email} assigneeId={r.assigneeMemberId} members={members} />
            </Td>

            <Td>
              <NurturePill lead={r} />
            </Td>

            <Td className="label-sm text-bone-quiet">
              <Link href={`/admin/leads/${r.id}`} className="transition-colors hover:text-gold">
                {r.touchCount}
              </Link>
            </Td>

            <Td right>
              <div className="flex flex-col items-end gap-1.5">
                <Link
                  href={`/admin/leads/${r.id}`}
                  className="py-1 label-sm text-gold transition-colors hover:text-gold-deep"
                >
                  Ver ficha
                </Link>
                {enrolled ? (
                  <ActionForm action={pauseLeadAction} success="Dado de baja.">
                    <input type="hidden" name="email" value={r.email} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                      Dar de baja
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <ActionForm action={enrollLeadAction} success="Inscrito en la secuencia.">
                    <input type="hidden" name="email" value={r.email} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                      Inscribir
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
