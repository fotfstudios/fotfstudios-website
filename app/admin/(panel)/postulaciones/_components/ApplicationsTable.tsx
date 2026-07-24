import { DateTime } from "luxon";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { Icon } from "@/components/admin/ui/icons";
import type { ApplicationRow } from "@/src/application/ports/applications";
import {
  type ApplicationStatus,
  SESSION_FORMAT_LABELS,
} from "@/src/domain/applications/application";
import { setApplicationStatusAction } from "../actions";

/** Transiciones ofrecidas por estado (solo las que llevan a OTRO estado). */
const TRANSITIONS: Record<ApplicationStatus, { to: ApplicationStatus; label: string }[]> = {
  nueva: [
    { to: "contactada", label: "Marcar contactada" },
    { to: "descartada", label: "Descartar" },
  ],
  contactada: [
    { to: "descartada", label: "Descartar" },
    { to: "nueva", label: "Volver a nueva" },
  ],
  descartada: [{ to: "nueva", label: "Volver a nueva" }],
};

const fmtDate = (iso: string) =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("d LLL yyyy, HH:mm");

const linkCls = "text-gold transition-colors hover:text-gold-deep";

export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  return (
    <DataTable
      minWidthClassName="min-w-[60rem]"
      head={
        <>
          <Th>Fecha</Th>
          <Th>Postulante</Th>
          <Th>Contacto</Th>
          <Th>Puede hacer</Th>
          <Th>Set / Redes</Th>
          <Th>Estado</Th>
          <Th right>Acciones</Th>
        </>
      }
    >
      {rows.map((r) => {
        const waDigits = r.phone.replace(/\D/g, "");
        return (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap label-sm text-bone-mute">{fmtDate(r.createdAt)}</Td>

            <Td>
              <p className="text-bone">{r.name}</p>
              <details className="mt-1">
                <summary className="label-sm cursor-pointer text-bone-mute transition-colors hover:text-gold">
                  Ver mensaje
                </summary>
                <p className="mt-2 max-w-md whitespace-pre-wrap text-sm text-bone-dim">{r.pitch}</p>
              </details>
            </Td>

            <Td className="label-sm">
              <a href={`mailto:${r.email}`} className={`block ${linkCls}`}>
                {r.email}
              </a>
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`block ${linkCls}`}
              >
                {r.phone}
              </a>
            </Td>

            <Td className="label-sm">
              <p className="text-bone-dim">{SESSION_FORMAT_LABELS[r.format]}</p>
              <p className="mt-1 text-bone-mute">{r.availability}</p>
            </Td>

            <Td className="label-sm">
              <a
                href={r.mixUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 ${linkCls}`}
              >
                Set <Icon name="external" size={13} />
              </a>
              {r.instagram && <p className="mt-1 text-bone-mute">@{r.instagram}</p>}
              {r.genres && <p className="mt-0.5 text-bone-mute">{r.genres}</p>}
            </Td>

            <Td>
              <StatusPill status={r.status} />
            </Td>

            <Td right>
              <div className="flex flex-col items-end gap-1.5">
                {TRANSITIONS[r.status].map((t) => (
                  <ActionForm key={t.to} action={setApplicationStatusAction} success="Estado actualizado.">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={t.to} />
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
