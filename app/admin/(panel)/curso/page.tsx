import Link from "next/link";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Field, Input } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { InscribirDialog } from "./_components/InscribirDialog";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { cancelSessionAction, issueTrialCreditAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curso — Admin", robots: { index: false } };

export default async function CursoPage() {
  await requirePermission("course.manage");

  const repo = courseRepository();
  const generacion = await repo.currentGeneration();
  const [sesiones, todas, inscritos] = await Promise.all([
    generacion ? repo.listSessions(generacion.id) : Promise.resolve([]),
    repo.listGenerations(),
    generacion ? repo.listEnrollments(generacion.id) : Promise.resolve([]),
  ]);
  const creditos = generacion ? await repo.listCredits().catch(() => []) : [];
  const vivos = inscritos.filter((i) => i.status === "reservada" || i.status === "pagada");
  const porPagar = vivos.filter((i) => i.status === "reservada").length;
  const recaudado = vivos
    .filter((i) => i.status === "pagada")
    .reduce((sum, i) => sum + i.priceClp, 0);

  const agendadas = sesiones.filter((s) => s.status === "agendada");
  const proxima = agendadas
    .filter((s) => s.startsAt && s.startsAt > new Date().toISOString())
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""))[0];

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Curso"
        editorial="Una generación a la vez, seis cupos."
        action={
          <>
            {generacion && (
              <InscribirDialog
                generationId={generacion.id}
                generationCode={generacion.code}
                prices={generacion.prices}
                seatsLeft={generacion.seatsLeft}
              />
            )}
            <Button href="/admin/curso/solicitudes" icon="user" variant="secondary">
              Solicitudes
            </Button>
            <Button href="/admin/curso/generaciones" icon="doc" variant="secondary">
              Generaciones
            </Button>
          </>
        }
      />

      {todas.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="curso"
            title="Aún no hay generaciones"
            hint="Crea la primera generación para fijar cupos, precios y plazo de inscripción."
            action={
              <Button href="/admin/curso/generaciones" icon="add" size="sm">
                Crear generación
              </Button>
            }
          />
        </div>
      ) : !generacion ? (
        <div className="mt-8">
          <EmptyState
            icon="curso"
            title="Ninguna generación abierta"
            hint="Abre una generación para recibir inscripciones."
            action={
              <Button href="/admin/curso/generaciones" size="sm">
                Ver generaciones
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Cupos tomados" value={`${generacion.seatsTaken} / ${generacion.seats}`} accent={generacion.seatsLeft === 0} />
            <Stat label="Por pagar" value={String(porPagar)} accent={porPagar > 0} />
            <Stat label="Recaudado" value={formatCLP(recaudado)} />
            <Stat
              label="Próxima sesión"
              value={proxima?.startsAt ? fmtDateTime(proxima.startsAt) : "Sin agendar"}
              accent={agendadas.length === 0}
            />
          </div>

          <div className="mt-8">
            <Card
              title={`${generacion.code} · ${generacion.name}`}
              action={<StatusPill status={generacion.status} />}
            >
              <MeterCell
                pct={generacion.seats > 0 ? (generacion.seatsTaken / generacion.seats) * 100 : 0}
                label={`${generacion.seatsTaken} de ${generacion.seats} cupos · quedan ${generacion.seatsLeft}`}
              />
              <p className="mt-4 label-sm text-bone-mute">
                {generacion.enrollDeadline ? `Cierra el ${fmtDate(generacion.enrollDeadline)}` : "Sin plazo de cierre"}
                {generacion.startsOn ? ` · parte el ${fmtDate(generacion.startsOn)}` : ""}
              </p>
            </Card>
          </div>

          <div className="mt-8">
            <Card title="Sesiones de prueba">
              <p className="mb-4 text-sm text-bone-dim">
                Registra una prueba ya hecha y queda el crédito de{" "}
                {formatCLP(generacion.prices.prueba)}, válido 7 días desde la sesión. Se aplica solo al
                inscribir a esa misma persona.
              </p>
              <ActionForm
                action={issueTrialCreditAction}
                success="Crédito emitido."
                resetOnSuccess
                className="grid gap-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end"
              >
                <Field label="Email del alumno">
                  <Input name="email" type="email" required maxLength={120} />
                </Field>
                <Field label="Día de la prueba">
                  <Input name="sessionDate" type="date" required />
                </Field>
                <div className="pb-1">
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Emitiendo…">
                    Emitir crédito
                  </SubmitButton>
                </div>
              </ActionForm>
              {creditos.length > 0 && (
                <ul className="mt-5 flex flex-col gap-2 border-t hairline pt-4">
                  {creditos.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-bone-dim">{c.email}</span>
                      <span className="label-sm text-bone-mute">
                        {c.consumedOrderId
                          ? "Usado"
                          : new Date(c.expiresAt) < new Date()
                            ? "Vencido"
                            : `Vence ${fmtDate(c.expiresAt)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-10">
            <h2 className="label mb-3 text-bone-mute">Inscritos</h2>
            {vivos.length === 0 ? (
              <EmptyState
                size="compact"
                icon="user"
                title="Sin inscritos todavía"
                hint="Las solicitudes que confirmes aparecen acá y toman cupo."
              />
            ) : (
              <DataTable
                minWidthClassName="min-w-[52rem]"
                head={
                  <>
                    <Th>Cupo</Th>
                    <Th>Alumno</Th>
                    <Th>Contacto</Th>
                    <Th>Formato</Th>
                    <Th right>Monto</Th>
                    <Th>Estado</Th>
                    <Th />
                  </>
                }
              >
                {vivos.map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-mono text-bone-mute">{i.seatNo}</Td>
                    <Td className="text-bone">{i.studentName}</Td>
                    <Td>
                      <a href={`mailto:${i.studentEmail}`} className="label-sm text-gold hover:text-bone">
                        {i.studentEmail}
                      </a>
                    </Td>
                    <Td className="text-bone-dim">{i.plan === "duo" ? "En dúo" : "Individual"}</Td>
                    <Td right className="whitespace-nowrap font-mono text-bone">
                      {formatCLP(i.priceClp)}
                    </Td>
                    <Td>
                      <StatusPill status={i.status} />
                    </Td>
                    <Td right>
                      <Link
                        href={`/admin/curso/inscripciones/${i.id}`}
                        aria-label={`Ver inscripción de ${i.studentName}`}
                        className="inline-flex text-bone-mute transition-colors hover:text-gold"
                      >
                        <Icon name="chevron" size={18} />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            )}
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="label text-bone-mute">Sesiones</h2>
              <Link href="/admin/curso/generaciones" className="label-sm text-gold transition-colors hover:text-bone">
                Agendar
              </Link>
            </div>
            {sesiones.length === 0 ? (
              <EmptyState
                size="compact"
                icon="clock"
                title="Sin sesiones agendadas"
                hint="Al agendarlas quedan bloqueadas en la sala y dejan de venderse en /reservar."
              />
            ) : (
              <DataTable
                minWidthClassName="min-w-[40rem]"
                head={
                  <>
                    <Th>#</Th>
                    <Th>Sesión</Th>
                    <Th>Cuándo</Th>
                    <Th>Estado</Th>
                    <Th />
                  </>
                }
              >
                {sesiones.map((s) => (
                  <Tr key={s.id} muted={s.status !== "agendada"}>
                    <Td className="font-mono text-bone-mute">{s.n}</Td>
                    <Td className="text-bone">{s.title}</Td>
                    <Td className="whitespace-nowrap font-mono text-bone-dim">
                      {s.startsAt ? fmtDateTime(s.startsAt) : "—"}
                    </Td>
                    <Td>
                      <StatusPill status={s.status === "agendada" ? "confirmed" : "cancelled"} />
                    </Td>
                    <Td right>
                      {s.status === "agendada" && (
                        <ConfirmForm
                          action={cancelSessionAction}
                          hidden={{ sessionId: s.id }}
                          trigger={{ label: "Cancelar", variant: "ghost", size: "sm" }}
                          title={`Cancelar la sesión ${s.n}`}
                          message="La sesión deja de bloquear la sala y ese horario vuelve a estar disponible para reservar. Queda registrada en el historial."
                          cta="Cancelar sesión"
                          success="Sesión cancelada."
                        />
                      )}
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            )}
          </div>
        </>
      )}
    </>
  );
}
