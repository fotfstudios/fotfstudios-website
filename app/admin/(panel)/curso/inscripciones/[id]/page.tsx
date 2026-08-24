import { notFound } from "next/navigation";
import { fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { Textarea } from "@/components/admin/ui/Field";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { courseCancellationPolicy } from "@/src/domain/course/cancellation-policy";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { cancelEnrollmentAction, setEnrollmentNotesAction } from "../../actions";
import { AnularPagada } from "./_components/AnularPagada";
import { CobroCurso } from "./_components/CobroCurso";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscripción — Admin", robots: { index: false } };

/** Cómo se llama cada alternativa sin dinero, en la voz del dueño. */
const REMEDY_LABEL: Record<string, string> = {
  transfer: "traspasar el cupo a la siguiente generación",
  substitute: "designar un reemplazante",
  reschedule_sessions: "reagendar las sesiones que falten",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InscripcionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("course.manage");
  const { id } = await params;
  // Un id malformado va a 404, no a un error de Postgres.
  if (!UUID_RE.test(id)) notFound();

  const repo = courseRepository();
  const inscripcion = await repo.enrollmentById(id);
  if (!inscripcion) notFound();

  const [compañeros, boletas, sesiones] = await Promise.all([
    inscripcion.orderId ? repo.enrollmentsByOrder(inscripcion.orderId) : Promise.resolve([inscripcion]),
    inscripcion.orderId ? repo.taxDocumentsForOrder(inscripcion.orderId) : Promise.resolve([]),
    repo.listSessions(inscripcion.generationId),
  ]);

  // Qué dicen los términos para ESTA inscripción, hoy. Se calcula en el servidor
  // para que el dueño vea la regla ya resuelta y no tenga que contar días.
  const primeraSesion =
    sesiones
      .filter((s) => s.status === "agendada" && s.startsAt)
      .map((s) => s.startsAt!)
      .sort()[0] ?? null;
  const politica = courseCancellationPolicy(primeraSesion);
  const totalPedido = inscripcion.orderAmountClp ?? inscripcion.priceClp;
  const duo = compañeros.filter((c) => c.id !== inscripcion.id);
  const waDigits = (inscripcion.studentPhone ?? "").replace(/\D/g, "");

  return (
    <>
      <PageHeader
        kicker={`${inscripcion.generationCode} · ${inscripcion.plan === "duo" ? "En dúo" : "Individual"}`}
        title={inscripcion.studentName}
        editorial="Curso de Iniciación DJ."
        action={<StatusPill status={inscripcion.status} />}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card title="Datos">
            <dl className="flex flex-col gap-3">
              <Dato label="Email">
                <a href={`mailto:${inscripcion.studentEmail}`} className="text-gold hover:text-bone">
                  {inscripcion.studentEmail}
                </a>
                <CopyButton value={inscripcion.studentEmail} label="Copiar email" />
              </Dato>
              {inscripcion.studentPhone && (
                <Dato label="WhatsApp">
                  <a
                    href={`https://wa.me/${waDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold hover:text-bone"
                  >
                    {inscripcion.studentPhone}
                  </a>
                </Dato>
              )}
              <Dato label="Cupo">
                <span className="font-mono text-bone">#{inscripcion.seatNo}</span>
              </Dato>
              {duo.length > 0 && (
                <Dato label="Va en dúo con">
                  <span className="text-bone">{duo.map((d) => d.studentName).join(", ")}</span>
                </Dato>
              )}
            </dl>
          </Card>

          <Card title="Notas">
            <ActionForm action={setEnrollmentNotesAction} success="Notas guardadas." className="flex flex-col gap-4">
              <input type="hidden" name="enrollmentId" value={inscripcion.id} />
              <Textarea name="notes" rows={3} maxLength={500} defaultValue={inscripcion.notes ?? ""} />
              <div>
                <SubmitButton size="sm" variant="secondary" pendingLabel="Guardando…">
                  Guardar notas
                </SubmitButton>
              </div>
            </ActionForm>
          </Card>

          {boletas.length > 0 && (
            <Card title="Documentos tributarios">
              <ul className="divide-y divide-ink-line">
                {boletas.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm text-bone">{doc.kind === "boleta" ? "Boleta" : "Nota de crédito"}</p>
                      <p className="label-sm mt-0.5 text-bone-mute">
                        Neto {formatCLP(doc.neto)} · IVA {formatCLP(doc.iva)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-display text-xl text-bone">{formatCLP(doc.total)}</span>
                      <StatusPill status={doc.status} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-bone-mute">
                Emítelas en el portal del SII y registra el folio desde la reserva correspondiente.
              </p>
            </Card>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <CobroCurso
            enrollmentId={inscripcion.id}
            status={inscripcion.status}
            totalClp={inscripcion.orderAmountClp ?? inscripcion.priceClp}
            paidMethod={inscripcion.paidMethod}
            paidAt={inscripcion.paidAt ? fmtDateTime(inscripcion.paidAt) : null}
            waDigits={waDigits || null}
          />

          {inscripcion.status === "pagada" && (
            <Card title="Cancelar">
              <p className="mb-4 text-sm text-bone-dim">{politica.label}.</p>
              <AnularPagada
                enrollmentId={inscripcion.id}
                totalClp={totalPedido}
                policyLabel={politica.label}
                policyAmount={politica.refundPct === 1 ? totalPedido : null}
                remedies={politica.remedies
                  .filter((r) => r !== "refund")
                  .map((r) => REMEDY_LABEL[r] ?? r)}
              />
            </Card>
          )}

          {inscripcion.status === "reservada" && (
            <Card title="Anular">
              <p className="mb-4 text-sm text-bone-dim">
                Libera {compañeros.length === 1 ? "el cupo" : `los ${compañeros.length} cupos`} y cancela el
                pedido.
              </p>
              <ConfirmForm
                action={cancelEnrollmentAction}
                hidden={{ enrollmentId: inscripcion.id }}
                trigger={{ label: "Anular inscripción", variant: "danger", size: "sm" }}
                title="Anular inscripción"
                message="El cupo vuelve a quedar libre y el cobro pendiente se cancela. No se emite boleta. Le avisamos por email."
                cta="Anular inscripción"
                success="Inscripción anulada."
              />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="label-sm w-28 shrink-0 text-bone-mute">{label}</dt>
      <dd className="flex items-center gap-2 text-sm text-bone-dim">{children}</dd>
    </div>
  );
}
