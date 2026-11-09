import { DateTime } from "luxon";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { leadsRepository } from "@/src/composition";
import type { LeadTouchView } from "@/src/domain/admin/leads-list";
import { nurtureStatus } from "@/src/domain/admin/leads-list";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { StageSelect } from "../_components/StageSelect";
import { AssigneeSelect } from "../_components/AssigneeSelect";
import { NotesForm } from "../_components/NotesForm";
import { NurturePill } from "../_components/NurturePill";
import { enrollLeadAction, pauseLeadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de lead — Admin", robots: { index: false } };

const TOUCH_LABEL: Record<string, string> = {
  guia_download: "Bajó una guía",
  newsletter_subscribe: "Se suscribió al newsletter",
  curso_solicitud: "Solicitó el curso",
  dj_application: "Postuló como DJ",
  booking_paid: "Pagó una reserva",
  course_enrolled: "Se inscribió al curso",
  manual: "Alta manual",
  nurture_sent: "Correo de nurture",
  unsubscribe: "Se dio de baja",
  stage_change: "Cambio de etapa",
  enroll: "Inscrito en nurture",
};

const fmt = (iso: string) =>
  DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es").toFormat("d LLL yyyy, HH:mm");

function touchExtra(t: LeadTouchView): string | null {
  const d = t.detail ?? {};
  if (t.kind === "nurture_sent" && typeof d.step === "string") return `paso: ${d.step}`;
  if (t.kind === "stage_change" && typeof d.stage_from === "string") return `${d.stage_from} → ${d.stage_to}`;
  const utm = [t.utmSource, t.utmMedium, t.utmCampaign].filter(Boolean).join(" · ");
  return utm || t.source || null;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("leads.manage");
  const { id } = await params;
  const [lead, members] = await Promise.all([leadsRepository().get(id), leadsRepository().assignableMembers()]);
  if (!lead) notFound();

  const enrolled = lead.consentAt && !lead.unsubscribedAt;
  const status = nurtureStatus(lead);

  return (
    <>
      <PageHeader kicker="Leads" title={lead.name ?? lead.email} />
      <Link href="/admin/leads" className="label-sm text-gold transition-colors hover:text-gold-deep">
        ← Volver a leads
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Ficha + embudo */}
        <div className="flex flex-col gap-6">
          <section className="border hairline bg-ink/40 p-5">
            <h2 className="label text-bone-quiet">Ficha</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-bone-quiet">Correo</dt>
              <dd className="text-bone">{lead.email}</dd>
              <dt className="text-bone-quiet">Teléfono</dt>
              <dd className="text-bone">{lead.phone ?? "—"}</dd>
              <dt className="text-bone-quiet">Origen</dt>
              <dd className="text-bone">{lead.source ?? "—"}</dd>
              <dt className="text-bone-quiet">Alta</dt>
              <dd className="text-bone">{fmt(lead.createdAt)}</dd>
            </dl>
          </section>

          <section className="border hairline bg-ink/40 p-5">
            <h2 className="label text-bone-quiet">Embudo</h2>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <StatusPill status={lead.stage} />
                <StageSelect email={lead.email} stage={lead.stage} />
              </div>
              <label className="flex flex-col gap-1.5 label-sm text-bone-quiet">
                Asignado a
                <AssigneeSelect email={lead.email} assigneeId={lead.assigneeMemberId} members={members} />
              </label>
              <NotesForm email={lead.email} notes={lead.notes} />
            </div>
          </section>

          <section className="border hairline bg-ink/40 p-5">
            <h2 className="label text-bone-quiet">Nurture</h2>
            <div className="mt-3 flex items-center gap-3">
              <NurturePill lead={lead} />
              {enrolled ? (
                <ActionForm action={pauseLeadAction} success="Dado de baja.">
                  <input type="hidden" name="email" value={lead.email} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                    Dar de baja
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={enrollLeadAction} success="Inscrito en la secuencia.">
                  <input type="hidden" name="email" value={lead.email} />
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                    Inscribir
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
            {status.state === "baja" && (
              <p className="label-sm mt-2 text-bone-quiet">Se suprimió el correo para todo el marketing.</p>
            )}
          </section>
        </div>

        {/* Timeline de atribución */}
        <section className="border hairline bg-ink/40 p-5">
          <h2 className="label text-bone-quiet">Atribución — {lead.touchCount} toques</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {lead.touches.map((t) => {
              const extra = touchExtra(t);
              return (
                <li key={t.id} className="border-l-2 border-ink-line pl-4">
                  <p className="text-sm text-bone">{TOUCH_LABEL[t.kind] ?? t.kind}</p>
                  <p className="label-sm text-bone-quiet">{fmt(t.occurredAt)}</p>
                  {extra && <p className="label-sm text-bone-dim">{extra}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
