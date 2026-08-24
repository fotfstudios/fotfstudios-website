import { fmtDate } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { CourseLeadRow } from "@/src/application/ports/course";
import {
  EXPERIENCE_LABELS,
  LEAD_PLAN_LABELS,
  type CourseLeadStatus,
} from "@/src/domain/course/course";
import { setLeadStatusAction } from "../actions";

/** Qué transiciones ofrece cada estado. 'inscrita' se alcanza inscribiendo, no acá. */
const TRANSITIONS: Record<CourseLeadStatus, { status: CourseLeadStatus; label: string }[]> = {
  nueva: [
    { status: "contactada", label: "Marcar contactada" },
    { status: "descartada", label: "Descartar" },
  ],
  contactada: [
    { status: "descartada", label: "Descartar" },
    { status: "nueva", label: "Volver a nueva" },
  ],
  // Reversible: descartar por error no puede ser un callejón sin salida.
  descartada: [{ status: "nueva", label: "Volver a nueva" }],
  inscrita: [],
};

export function SolicitudesTable({ rows }: { rows: CourseLeadRow[] }) {
  return (
    <DataTable
      minWidthClassName="min-w-[64rem]"
      head={
        <>
          <Th>Fecha</Th>
          <Th>Persona</Th>
          <Th>Contacto</Th>
          <Th>Busca</Th>
          <Th>Disponibilidad</Th>
          <Th>Estado</Th>
          <Th />
        </>
      }
    >
      {rows.map((r) => {
        const waDigits = r.phone.replace(/\D/g, "");
        return (
          <Tr key={r.id} muted={r.status === "descartada"}>
            <Td className="whitespace-nowrap font-mono text-bone-mute">{fmtDate(r.createdAt)}</Td>
            <Td className="text-bone">
              {r.name}
              {r.message && (
                <details className="mt-1">
                  <summary className="label-sm cursor-pointer text-bone-mute hover:text-gold">
                    Ver mensaje
                  </summary>
                  <p className="mt-2 max-w-md whitespace-pre-wrap border-l border-ink-line pl-3 text-sm text-bone-dim">
                    {r.message}
                  </p>
                </details>
              )}
            </Td>
            <Td>
              <a href={`mailto:${r.email}`} className="label-sm text-gold hover:text-bone">
                {r.email}
              </a>
              <br />
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="label-sm text-bone-mute hover:text-gold"
              >
                {r.phone}
              </a>
            </Td>
            <Td className="text-bone-dim">
              {LEAD_PLAN_LABELS[r.plan]}
              <span className="block label-sm text-bone-mute">{EXPERIENCE_LABELS[r.experience]}</span>
            </Td>
            <Td className="max-w-[16rem] text-bone-dim">{r.availability}</Td>
            <Td>
              <StatusPill status={r.status} />
            </Td>
            <Td right>
              <div className="flex flex-col items-end gap-1.5">
                {TRANSITIONS[r.status].map((t) => (
                  <ActionForm key={t.status} action={setLeadStatusAction} success="Solicitud actualizada.">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={t.status} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                      {t.label}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </div>
            </Td>
          </Tr>
        );
      })}
    </DataTable>
  );
}
