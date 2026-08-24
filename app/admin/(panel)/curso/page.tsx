import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { cancelSessionAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curso — Admin", robots: { index: false } };

export default async function CursoPage() {
  await requirePermission("course.manage");

  const repo = courseRepository();
  const generacion = await repo.currentGeneration();
  const [sesiones, todas] = await Promise.all([
    generacion ? repo.listSessions(generacion.id) : Promise.resolve([]),
    repo.listGenerations(),
  ]);

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
            <Button href="/admin/curso/solicitudes" icon="user">
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
            <Stat label="Precio en dúo" value={formatCLP(generacion.prices.duo)} />
            <Stat label="Precio individual" value={formatCLP(generacion.prices.individual)} />
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
