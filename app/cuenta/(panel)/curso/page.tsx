import { fmtDate, fmtDay, fmtTimeRange } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SITE } from "@/lib/site";
import { courseRepository } from "@/src/composition";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { formatCLP } from "@/src/domain/money/money";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

/**
 * El curso del alumno. Vive aparte de /cuenta/reservas porque no es una reserva:
 * es su propio programa 1:1, con agenda y estado de pago propios.
 */
export default async function CuentaCurso() {
  const session = await requireCustomer();
  const cursos = await courseRepository().coursesForEmail(session.email);

  return (
    <main className="space-y-8">
      <PageHeader
        title="Tu curso"
        // Sin inscripción, la única CTA es la del estado vacío (dos botones al
        // mismo /curso-dj en una pantalla era ruido).
        action={
          cursos.length > 0 ? (
            <Button href="/curso-dj" icon="external" variant="secondary">
              Ver el curso
            </Button>
          ) : undefined
        }
      />

      {cursos.length === 0 ? (
        <EmptyState
          icon="curso"
          title="Todavía no estás inscrito"
          hint="El Curso de Iniciación DJ parte de cero: seis sesiones 1:1, seis horas de práctica libre y tu set final grabado."
          action={<Button href="/curso-dj">Conocer el curso</Button>}
        />
      ) : (
        cursos.map((curso) => {
          const pagado = curso.status === "pagada";
          const libres = Math.max(0, curso.practiceHoursTotal - curso.practiceHoursRedeemed);
          return (
            <Card
              key={curso.enrollmentId}
              title="Curso de Iniciación DJ"
              action={<StatusPill status={curso.status} />}
            >
              <dl className="flex flex-col gap-3">
                <Fila label="Formato">{curso.plan === "duo" ? "En dúo" : "Individual"}</Fila>
                {curso.instructor && <Fila label="Instructor">{curso.instructor}</Fila>}
                <Fila label="Total">
                  {formatCLP(curso.orderAmountClp ?? curso.priceClp)}
                  {/* Espacio explícito: el margen es visual, pero un lector de
                      pantalla lee el texto pegado sin él. */}
                  {!pagado && <span className="ml-2 text-bone-quiet"> · pendiente de pago</span>}
                </Fila>
                {pagado && (
                  <Fila label="Práctica">
                    {libres} de {curso.practiceHoursTotal} {curso.practiceHoursTotal === 1 ? "hora libre" : "horas libres"}
                    {curso.practiceValidUntil && (
                      <span className="text-bone-quiet"> · vencen el {fmtDay(curso.practiceValidUntil)}</span>
                    )}
                  </Fila>
                )}
                {pagado && (
                  <Fila label="Dónde">
                    {SITE.address}
                  </Fila>
                )}
              </dl>

              <div className="mt-6 border-t hairline pt-5">
                <h3 className="label-sm mb-3 text-bone-quiet">Sesiones</h3>
                {curso.sessions.length === 0 ? (
                  <p className="text-sm text-bone-quiet">
                    Fijamos contigo las fechas de tus {COURSE_PROGRAM.sessions} sesiones por WhatsApp.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {curso.sessions.map((s) => (
                      <li key={s.n} className="flex flex-wrap items-baseline gap-x-4 border-t hairline py-3 first:border-0 first:pt-0">
                        <span className="font-mono text-bone-quiet">{String(s.n).padStart(2, "0")}</span>
                        <span className="text-bone">{s.title}</span>
                        <span className="ml-auto font-mono text-sm text-bone-dim">
                          {s.startsAt
                            ? s.endsAt
                              ? `${fmtDate(s.startsAt)} · ${fmtTimeRange(s.startsAt, s.endsAt)}`
                              : fmtDate(s.startsAt)
                            : "Por confirmar"}
                          {s.status === "dictada" && <span className="label-sm ml-2 text-bone-quiet"> · Dictada</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {curso.sessions.length > 0 && curso.sessions.length < COURSE_PROGRAM.sessions && (
                  <p className="mt-3 text-sm text-bone-quiet">
                    {COURSE_PROGRAM.sessions - curso.sessions.length === 1
                      ? "Queda 1 sesión por agendar: la fijamos contigo por WhatsApp."
                      : `Quedan ${COURSE_PROGRAM.sessions - curso.sessions.length} sesiones por agendar: las fijamos contigo por WhatsApp.`}
                  </p>
                )}
              </div>

              {pagado && (
                <p className="mt-5 label-sm text-bone-quiet">
                  Qué traer: tus audífonos y un USB con tu música.
                </p>
              )}
            </Card>
          );
        })
      )}
    </main>
  );
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <dt className="label-sm w-24 shrink-0 text-bone-quiet">{label}</dt>
      <dd className="text-sm text-bone-dim">{children}</dd>
    </div>
  );
}
