import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SITE } from "@/lib/site";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

/**
 * El curso del alumno. Vive aparte de /cuenta/reservas porque no es una reserva:
 * es un asiento en una generación, con su propia agenda y su propio estado de pago.
 */
export default async function CuentaCurso() {
  const session = await requireCustomer();
  const cursos = await courseRepository().coursesForEmail(session.email);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Mi cuenta"
        title="Tu curso"
        editorial="Cuatro sesiones, una cabina."
        action={
          <Button href="/curso-dj" icon="external" variant="secondary">
            Ver el curso
          </Button>
        }
      />

      {cursos.length === 0 ? (
        <EmptyState
          icon="curso"
          title="Todavía no estás inscrito"
          hint="El Curso de Iniciación DJ parte de cero: ocho horas de clase, cuatro de práctica libre y tu set final grabado."
          action={<Button href="/curso-dj">Conocer el curso</Button>}
        />
      ) : (
        cursos.map((curso) => {
          const pagado = curso.status === "pagada";
          return (
            <Card
              key={curso.enrollmentId}
              title={`${curso.generationCode} · ${curso.generationName}`}
              action={<StatusPill status={curso.status} />}
            >
              <dl className="flex flex-col gap-3">
                <Fila label="Formato">{curso.plan === "duo" ? "En dúo" : "Individual"}</Fila>
                <Fila label="Total">
                  {formatCLP(curso.orderAmountClp ?? curso.priceClp)}
                  {/* Espacio explícito: el margen es visual, pero un lector de
                      pantalla lee el texto pegado sin él. */}
                  {!pagado && <span className="ml-2 text-bone-mute"> · pendiente de pago</span>}
                </Fila>
                {pagado && (
                  <Fila label="Dónde">
                    {SITE.address}
                  </Fila>
                )}
              </dl>

              <div className="mt-6 border-t hairline pt-5">
                <h3 className="label-sm mb-3 text-bone-mute">Sesiones</h3>
                {curso.sessions.length === 0 ? (
                  <p className="text-sm text-bone-mute">
                    Todavía estamos cerrando las fechas. Te avisamos por WhatsApp apenas estén.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {curso.sessions.map((s) => (
                      <li key={s.n} className="flex flex-wrap items-baseline gap-x-4 border-t hairline py-3 first:border-0 first:pt-0">
                        <span className="font-mono text-bone-mute">{String(s.n).padStart(2, "0")}</span>
                        <span className="text-bone">{s.title}</span>
                        <span className="ml-auto font-mono text-sm text-bone-dim">
                          {s.startsAt ? fmtDateTime(s.startsAt) : "Por confirmar"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {pagado && (
                <p className="mt-5 label-sm text-bone-mute">
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
      <dt className="label-sm w-24 shrink-0 text-bone-mute">{label}</dt>
      <dd className="text-sm text-bone-dim">{children}</dd>
    </div>
  );
}
