import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { createBlockAction, deleteBlockAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { adminRepository } from "@/src/composition";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bloqueos — Admin", robots: { index: false } };

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60);
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;

export default async function BloqueosPage() {
  const blocks = await adminRepository().upcomingBlocks();

  return (
    <AdminShell>
      <PageHeader kicker="Operación" title="Bloqueos" editorial="Mantención, uso personal o feriados." />

      <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card title="Bloquear un horario">
          <ActionForm action={createBlockAction} success="Horario bloqueado." resetOnSuccess className="flex flex-col gap-5">
            <Field label="Día">
              <Input type="date" name="date" required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Inicio">
                <Select name="startMinute" defaultValue={540}>
                  {HOURS.map((m) => (
                    <option key={m} value={m}>
                      {hh(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horas">
                <Input type="number" name="durationHours" min={1} max={13} defaultValue={1} required />
              </Field>
            </div>
            <div>
              <SubmitButton icon="block" pendingLabel="Bloqueando…">
                Bloquear
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <div>
          <h2 className="mb-3 label text-bone-mute">Bloqueos próximos</h2>
          {blocks.length === 0 ? (
            <EmptyState icon="block" title="Sin bloqueos" hint="Los horarios bloqueados aparecerán acá y no se podrán reservar." />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Horario</Th>
                  <Th />
                </>
              }
            >
              {blocks.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-mono text-bone">
                    {fmtDateTime(b.startsAt)} <span className="text-bone-mute">→</span> {fmtDateTime(b.endsAt)}
                  </Td>
                  <Td right>
                    <ConfirmForm
                      action={deleteBlockAction}
                      hidden={{ id: b.id }}
                      trigger={{ label: "Eliminar", variant: "ghost", size: "sm" }}
                      title="Eliminar bloqueo"
                      message="El horario volverá a estar disponible para reservar."
                      cta="Eliminar bloqueo"
                      success="Bloqueo eliminado."
                    />
                  </Td>
                </Tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
