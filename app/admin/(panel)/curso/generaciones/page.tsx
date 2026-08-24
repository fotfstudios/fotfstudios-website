import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { PRECIOS, CURSO } from "@/app/curso-dj/_content";
import { courseRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { createGenerationAction, scheduleGenerationAction, setGenerationStatusAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Generaciones — Admin", robots: { index: false } };

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60);
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;

export default async function GeneracionesPage() {
  await requirePermission("course.manage");

  const generaciones = await courseRepository().listGenerations();
  // La generación anterior es el mejor default para la próxima; si no hay ninguna,
  // los números que hoy vive la landing en _content.ts.
  const base = generaciones[0];
  const precios = base?.prices ?? PRECIOS;

  return (
    <>
      <PageHeader kicker="Curso" title="Generaciones" editorial="Cada cohorte, su precio y sus cupos." />

      <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Nueva generación">
          <ActionForm
            action={createGenerationAction}
            success="Generación creada."
            resetOnSuccess
            className="flex flex-col gap-5"
          >
            <div className="grid grid-cols-[7rem_1fr] gap-4">
              <Field label="Código">
                <Input name="code" required maxLength={8} placeholder="G01" />
              </Field>
              <Field label="Nombre">
                <Input name="name" required maxLength={60} placeholder="Primera generación" />
              </Field>
            </div>
            <Field label="Cupos" hint="Cuántas personas entran en la cabina.">
              <Input type="number" name="seats" min={1} max={12} defaultValue={CURSO.cupos} required />
            </Field>
            <Field label="Precio en dúo" hint="Por persona.">
              <Input type="number" name="priceDuo" min={0} defaultValue={precios.duo} required />
            </Field>
            <Field label="Precio individual">
              <Input type="number" name="priceIndividual" min={0} defaultValue={precios.individual} required />
            </Field>
            <Field label="Sesión de prueba">
              <Input type="number" name="pruebaPrice" min={0} defaultValue={precios.prueba} required />
            </Field>
            <Field label="Cierre de inscripción" hint="Opcional.">
              <Input type="date" name="enrollDeadline" />
            </Field>
            <Field label="Parte el" hint="Opcional.">
              <Input type="date" name="startsOn" />
            </Field>
            <div>
              <SubmitButton icon="add" pendingLabel="Creando…">
                Crear generación
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-6">
          {generaciones.length === 0 ? (
            <EmptyState
              icon="curso"
              title="Sin generaciones"
              hint="La generación abierta define los cupos y los precios que se cobran."
            />
          ) : (
            <DataTable
              minWidthClassName="min-w-[44rem]"
              head={
                <>
                  <Th>Código</Th>
                  <Th>Estado</Th>
                  <Th>Cupos</Th>
                  <Th right>Dúo</Th>
                  <Th right>Individual</Th>
                  <Th />
                </>
              }
            >
              {generaciones.map((g) => (
                <Tr key={g.id} muted={g.status === "cerrada" || g.status === "cancelada"}>
                  <Td className="whitespace-nowrap">
                    <span className="font-mono text-bone">{g.code}</span>
                    <span className="ml-2 label-sm text-bone-mute">{g.name}</span>
                  </Td>
                  <Td>
                    <StatusPill status={g.status} />
                  </Td>
                  <Td className="min-w-[9rem]">
                    <MeterCell
                      pct={g.seats > 0 ? (g.seatsTaken / g.seats) * 100 : 0}
                      label={`${g.seatsTaken}/${g.seats}`}
                    />
                  </Td>
                  <Td right className="whitespace-nowrap font-mono text-bone-dim">{formatCLP(g.prices.duo)}</Td>
                  <Td right className="whitespace-nowrap font-mono text-bone-dim">
                    {formatCLP(g.prices.individual)}
                  </Td>
                  <Td right>
                    <div className="flex justify-end gap-1.5">
                      {g.status === "borrador" && (
                        <ActionForm action={setGenerationStatusAction} success="Generación abierta.">
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="status" value="abierta" />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="Abriendo…">
                            Abrir
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {g.status === "abierta" && (
                        <ActionForm action={setGenerationStatusAction} success="Generación en curso.">
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="status" value="en_curso" />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="Guardando…">
                            Marcar en curso
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {(g.status === "abierta" || g.status === "en_curso") && (
                        <ConfirmForm
                          action={setGenerationStatusAction}
                          hidden={{ id: g.id, status: "cerrada" }}
                          trigger={{ label: "Cerrar", variant: "ghost", size: "sm" }}
                          title={`Cerrar ${g.code}`}
                          message="Deja de recibir inscripciones. Las inscripciones ya hechas no se tocan y las sesiones agendadas siguen bloqueando la sala."
                          cta="Cerrar generación"
                          success="Generación cerrada."
                        />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          )}

          {base && (base.status === "borrador" || base.status === "abierta") && (
            <Card title={`Agendar sesiones · ${base.code}`}>
              <ActionForm action={scheduleGenerationAction} success="Sesiones agendadas." className="flex flex-col gap-5">
                <input type="hidden" name="id" value={base.id} />
                <p className="text-sm text-bone-dim">
                  Se crean todas de una vez, semana a semana. Si alguna choca con una reserva, no se agenda
                  ninguna — y te decimos cuál fue.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Primera sesión">
                    <Input type="date" name="firstDate" required />
                  </Field>
                  <Field label="Hora">
                    <Select name="startMinute" defaultValue={1200}>
                      {HOURS.map((m) => (
                        <option key={m} value={m}>
                          {hh(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Horas por sesión">
                    <Input type="number" name="durationHours" min={1} max={12} defaultValue={2} required />
                  </Field>
                  <Field label="Cuántas sesiones">
                    <Input type="number" name="sessions" min={1} max={12} defaultValue={4} required />
                  </Field>
                </div>
                <div>
                  <SubmitButton icon="clock" pendingLabel="Agendando…">
                    Agendar sesiones
                  </SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
