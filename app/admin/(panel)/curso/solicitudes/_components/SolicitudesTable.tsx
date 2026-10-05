import { fmtDate } from "@/components/admin/format";
import Link from "next/link";
import { btn } from "@/components/admin/ui/styles";
import { trialCreditState } from "@/src/domain/course/credit";
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
import { PRECIOS } from "@/lib/curso-content";
import { NuevoProgramaDialog } from "../../_components/NuevoProgramaDialog";
import { requestReviewAction, setLeadStatusAction } from "../actions";

/** Qué transiciones ofrece cada estado. 'inscrita' se alcanza con «Inscribir» (crea el programa). */
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
            <Td className="whitespace-nowrap font-mono text-bone-quiet">{fmtDate(r.createdAt)}</Td>
            <Td className="text-bone">
              {r.name}
              {r.message && (
                <details className="mt-1">
                  <summary className="label-sm cursor-pointer text-bone-quiet hover:text-gold">
                    Ver mensaje
                  </summary>
                  <p className="mt-2 max-w-md whitespace-pre-wrap border-l border-ink-line pl-3 text-sm text-bone-dim">
                    {r.message}
                  </p>
                </details>
              )}
            </Td>
            <Td>
              <a href={`mailto:${r.email}`} className="label-sm block py-1 text-gold hover:text-bone">
                {r.email}
              </a>
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="label-sm block py-1 text-bone-quiet hover:text-gold"
              >
                {r.phone}
              </a>
            </Td>
            <Td className="text-bone-dim">
              {LEAD_PLAN_LABELS[r.plan]}
              <span className="block label-sm text-bone-quiet">{EXPERIENCE_LABELS[r.experience]}</span>
            </Td>
            <Td className="max-w-[16rem] text-bone-dim">{r.availability}</Td>
            <Td>
              <StatusPill status={r.status} />
              {r.trial && <TrialLine trial={r.trial} />}
            </Td>
            <Td right>
              <div className="flex flex-col items-end gap-1.5">
                {(r.status === "nueva" || r.status === "contactada") && !hasLiveTrial(r.trial) && (
                  <Link href={`/admin/reservas/nueva?tipo=prueba&lead=${r.id}`} className={btn("secondary", "sm")}>
                    Agendar prueba
                  </Link>
                )}
                {(r.status === "nueva" || r.status === "contactada") && (
                  <NuevoProgramaDialog
                    prices={PRECIOS}
                    lead={{ id: r.id, name: r.name, email: r.email, phone: r.phone, plan: r.plan }}
                    trigger={{ label: "Inscribir", variant: "secondary", size: "sm" }}
                  />
                )}
                {TRANSITIONS[r.status].map((t) => (
                  <ActionForm key={t.status} action={setLeadStatusAction} success="Solicitud actualizada.">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={t.status} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                      {t.label}
                    </SubmitButton>
                  </ActionForm>
                ))}
                {(r.status === "contactada" || r.status === "inscrita") && (
                  <ActionForm action={requestReviewAction} success="Pedido de reseña enviado.">
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Enviando…">
                      Pedir reseña
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

/** Una prueba cancelada o vencida sin pagar no cuenta: se puede agendar otra. */
function hasLiveTrial(t: CourseLeadRow["trial"]): boolean {
  return !!t && (t.status === "confirmed" || t.status === "held");
}

/** "Prueba 8 oct · crédito vence 15 oct" / "Crédito usado" / "Crédito vencido". */
function TrialLine({ trial }: { trial: NonNullable<CourseLeadRow["trial"]> }) {
  const live = hasLiveTrial(trial);
  const state = trial.credit ? trialCreditState(trial.credit) : null;
  const credit =
    state === "vigente"
      ? `crédito vence ${fmtDate(trial.credit!.expiresAt)}`
      : state === "vencido"
        ? "crédito vencido"
        : state === "usado"
          ? "crédito usado"
          : state === "anulado"
            ? "prueba devuelta"
            : trial.status === "held"
              ? "pendiente de pago"
              : null;
  return (
    <Link
      href={`/admin/reservas/${trial.reservationId}`}
      className={`label-sm mt-1.5 block hover:text-gold ${state === "vencido" ? "text-sirena" : live ? "text-gold" : "text-bone-quiet"}`}
    >
      Prueba {fmtDate(trial.startsAt)}
      {credit ? ` · ${credit}` : ""}
      {!live && !trial.credit ? " · cancelada" : ""}
    </Link>
  );
}
