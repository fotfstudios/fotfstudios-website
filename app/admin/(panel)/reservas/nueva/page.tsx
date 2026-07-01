import { createManualBookingAction } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva manual — Admin", robots: { index: false } };

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60); // 09:00–22:00
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;

export default function NuevaReserva() {
  return (
    <>
      <PageHeader kicker="Operación" title="Reserva manual" editorial="Walk-in, teléfono o WhatsApp." />

      <div className="mt-8 max-w-xl">
        <Card>
          <ActionForm
            action={createManualBookingAction}
            success="Reserva creada."
            navigateTo="/admin/reservas"
            className="flex flex-col gap-5"
          >
            <Field label="Día">
              <Input type="date" name="date" required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Inicio">
                <Select name="startMinute" defaultValue={600}>
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

            <div className="border-t hairline pt-5">
              <p className="label-sm text-bone-mute">Cliente</p>
              <div className="mt-3 flex flex-col gap-4">
                <Input type="text" name="name" placeholder="Nombre" />
                <Input type="email" name="email" placeholder="Email (opcional)" />
                <Input type="tel" name="phone" placeholder="Teléfono" />
              </div>
            </div>

            <Field label="Pago">
              <Select name="method" defaultValue="efectivo">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cortesia">Cortesía</option>
              </Select>
              <p className="mt-2 label-sm text-bone-mute">Cortesía = reserva sin cobro ni boleta.</p>
            </Field>

            <div>
              <SubmitButton icon="add" pendingLabel="Creando…">
                Crear reserva
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
