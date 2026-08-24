import { fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { redeemPracticeAction, releasePracticeAction } from "../../../actions";

const HOURS = Array.from({ length: 14 }, (_, i) => 540 + i * 60);
const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;

/**
 * Las 4 horas de práctica libre, como saldo. No se pre-bloquean: se materializan
 * como reserva recién al agendarlas, y ahí recién ocupan la cabina.
 */
export function Practica({
  enrollmentId,
  total,
  redeemed,
  redemptions,
}: {
  enrollmentId: string;
  total: number;
  redeemed: number;
  redemptions: { id: string; reservationId: string; hours: number; startsAt: string | null; releasedAt: string | null }[];
}) {
  const libres = Math.max(0, total - redeemed);
  const vivas = redemptions.filter((r) => !r.releasedAt);

  return (
    <Card title="Práctica libre">
      <MeterCell
        pct={total > 0 ? (redeemed / total) * 100 : 0}
        label={`${libres} de ${total} ${total === 1 ? "hora" : "horas"} disponibles`}
      />

      {vivas.length > 0 && (
        <ul className="mt-5 flex flex-col border-t hairline pt-4">
          {vivas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-3 first:border-0 first:pt-0">
              <span className="font-mono text-sm text-bone-dim">
                {r.startsAt ? fmtDateTime(r.startsAt) : "—"}
                <span className="ml-2 text-bone-mute">
                  {r.hours} {r.hours === 1 ? "hora" : "horas"}
                </span>
              </span>
              <ConfirmForm
                action={releasePracticeAction}
                hidden={{ enrollmentId, reservationId: r.reservationId }}
                trigger={{ label: "Cancelar", variant: "ghost", size: "sm" }}
                title="Cancelar la práctica"
                message="El horario vuelve a estar disponible y la hora regresa al saldo del alumno."
                cta="Cancelar práctica"
                success="Práctica cancelada."
              />
            </li>
          ))}
        </ul>
      )}

      {libres > 0 ? (
        <ActionForm
          action={redeemPracticeAction}
          success="Práctica agendada."
          resetOnSuccess
          className="mt-5 grid gap-4 border-t hairline pt-5 sm:grid-cols-[1fr_7rem_6rem_auto] sm:items-end"
        >
          <input type="hidden" name="enrollmentId" value={enrollmentId} />
          <Field label="Día">
            <Input type="date" name="date" required />
          </Field>
          <Field label="Hora">
            <Select name="startMinute" defaultValue={900}>
              {HOURS.map((m) => (
                <option key={m} value={m}>
                  {hh(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horas">
            <Input type="number" name="hours" min={1} max={libres} defaultValue={1} required />
          </Field>
          <div className="pb-1">
            <SubmitButton size="sm" variant="secondary" pendingLabel="Agendando…">
              Agendar
            </SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="mt-5 border-t hairline pt-4 label-sm text-bone-mute">
          {total === 0 ? "Esta inscripción no incluye horas de práctica." : "Ya usó todas sus horas."}
        </p>
      )}
    </Card>
  );
}
