import Link from "next/link";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Field, Input } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { NuevoProgramaDialog } from "./_components/NuevoProgramaDialog";
import { courseRepository } from "@/src/composition";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { issueTrialCreditAction } from "./actions";
import { TrialsTable } from "./_components/TrialsTable";
import { PRECIOS } from "@/lib/curso-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curso — Admin", robots: { index: false } };

/**
 * El curso 1:1: un programa por pedido (una persona, o un dúo). La lista muestra
 * los programas con alumnos vivos; cada fila abre la ficha, donde se agendan y
 * mueven sus sesiones.
 */
export default async function CursoPage() {
  await requirePermission("course.manage");

  const repo = courseRepository();
  const [programas, pruebas] = await Promise.all([
    repo.listLivePrograms(),
    repo.listTrialCredits().catch(() => []),
  ]);

  const porPagar = programas.filter((p) => p.students.some((s) => s.status === "reservada")).length;
  const proxima = programas
    .map((p) => p.nextSession?.startsAt)
    .filter((s): s is string => Boolean(s))
    .sort()[0];

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Curso"
        action={
          <>
            <NuevoProgramaDialog prices={PRECIOS} />
            <Button href="/admin/curso/solicitudes" icon="user" variant="secondary">
              Solicitudes
            </Button>
          </>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Programas activos" value={String(programas.length)} />
        <Stat label="Por pagar" value={String(porPagar)} accent={porPagar > 0} />
        <Stat label="Próxima sesión" value={proxima ? fmtDateTime(proxima) : "Sin agendar"} />
      </div>

      <div className="mt-10">
        <h2 className="label mb-3 text-bone-quiet">Programas</h2>
        {programas.length === 0 ? (
          <EmptyState
            icon="curso"
            title="Sin programas activos"
            hint="Crea uno con «Nuevo programa», o inscribe una solicitud desde Solicitudes."
          />
        ) : (
          <DataTable
            minWidthClassName="min-w-[56rem]"
            head={
              <>
                <Th>Código</Th>
                <Th>Alumno</Th>
                <Th>Formato</Th>
                <Th>Instructor</Th>
                <Th>Sesiones</Th>
                <Th>Práctica</Th>
                <Th>Estado</Th>
                <Th />
              </>
            }
          >
            {programas.map((p) => {
              const vivas = p.sessions.filter((s) => s.status !== "cancelada");
              const total = p.students.reduce((n, s) => n + s.practiceHoursTotal, 0);
              const usadas = p.students.reduce((n, s) => n + s.practiceHoursRedeemed, 0);
              const pendiente = p.students.some((s) => s.status === "reservada");
              const nombre = p.students.map((s) => s.name).join(" y ");
              return (
                <Tr key={p.generationId} className="group relative focus-within:bg-ink-soft">
                  <Td className="font-mono text-bone-quiet">{p.code}</Td>
                  <Td className="text-bone">{nombre}</Td>
                  <Td className="text-bone-dim">{p.plan === "duo" ? "En dúo" : "Individual"}</Td>
                  <Td className="text-bone-dim">{p.instructor ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-bone-dim">
                    <span className="font-mono">
                      {vivas.length}/{COURSE_PROGRAM.sessions}
                    </span>
                    <span className="label-sm ml-2 text-bone-quiet">
                      {p.nextSession?.startsAt ? `próx. ${fmtDateTime(p.nextSession.startsAt)}` : "sin fecha"}
                    </span>
                  </Td>
                  <Td>
                    <MeterCell pct={total > 0 ? (usadas / total) * 100 : 0} label={`${usadas}/${total} h`} />
                  </Td>
                  <Td>
                    <StatusPill status={pendiente ? "reservada" : "pagada"} />
                  </Td>
                  <Td right>
                    <Link
                      href={`/admin/curso/inscripciones/${p.students[0].enrollmentId}`}
                      aria-label={`Ver programa de ${nombre}`}
                      className="inline-flex text-bone-quiet outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
                    >
                      <Icon name="chevron" size={18} />
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        )}
      </div>

      <div className="mt-10">
        <Card title="Sesiones de prueba">
          <p className="mb-4 text-sm text-bone-dim">
            Se agendan desde <Link href="/admin/reservas/nueva?tipo=prueba" className="text-gold hover:underline">Reserva manual → Prueba del curso</Link> (1 h,{" "}
            {formatCLP(PRECIOS.prueba)}). Al pagarse dejan un crédito por lo pagado que vale 7 días desde la sesión: se
            aplica solo al inscribir a esa misma persona, y puedes extenderlo.
          </p>
          {pruebas.length > 0 ? (
            <TrialsTable rows={pruebas} />
          ) : (
            <EmptyState size="compact" title="Sin pruebas todavía" hint="Las pruebas pagadas aparecen acá con su crédito." />
          )}
          <details className="mt-6 border-t hairline pt-4">
            <summary className="label-sm cursor-pointer text-bone-quiet hover:text-bone">
              Registrar una prueba antigua (agendada como ensayo)
            </summary>
            <div className="mt-4">
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
            </div>
          </details>
        </Card>
      </div>
    </>
  );
}
