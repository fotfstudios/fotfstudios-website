"use client";

import { type MouseEvent, useState } from "react";
import { DateTime } from "luxon";
import type { ActionDataResult, ActionResult } from "@/components/admin/ui/action";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import type { DayConsoleData } from "@/components/admin/day-occupancy";
import { formatSessionWhen } from "@/src/application/notifications/format-when";

export interface MoveSummaryRow {
  label: string;
  value: string;
}

/**
 * Mover una reserva de duración FIJA a otro día u hora, sin plata (la prueba del curso, una
 * hora de práctica). Dos pasos: elegir → revisar el resumen → confirmar.
 *
 * "Revisar" NO envía el form (React 19 lo limpia al enviar y se perdería la hora elegida):
 * lee la selección y esconde el picker, que sigue montado con sus valores; "Volver" lo
 * muestra igual. Solo "Confirmar" envía. Los horarios salen en el formato de los correos
 * (formatSessionWhen): el admin lee lo mismo que va a recibir el cliente.
 */
export function MoveSlotDialog({
  trigger,
  title,
  action,
  success,
  hidden,
  tz,
  startsAt,
  endsAt,
  loadDay,
  ignoreId,
  who,
  rows,
  pickerNote,
}: {
  trigger: string;
  title: string;
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  success: string;
  /** Campos ocultos del form (ids). */
  hidden: Record<string, string>;
  tz: string;
  /** Horario actual (ISO): el picker abre ahí, el resumen lo muestra como "antes" y fija la duración. */
  startsAt: string;
  endsAt: string;
  loadDay: (date: string) => Promise<ActionDataResult<DayConsoleData>>;
  /** Reserva que no cuenta como ocupada: la propia. */
  ignoreId: string;
  /** Primera fila del resumen: "Cliente" / "Alumno" y su nombre. */
  who: MoveSummaryRow;
  /** Filas después de antes → ahora (cobro, saldo, PIN, avisos…). */
  rows: MoveSummaryRow[];
  pickerNote: string;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<{ startsAt: string; endsAt: string } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const current = DateTime.fromISO(startsAt).setZone(tz);
  const durationMin = Math.round(DateTime.fromISO(endsAt).diff(DateTime.fromISO(startsAt), "minutes").minutes);
  const before = formatSessionWhen(startsAt, tz, { endsAt });

  const close = () => {
    setOpen(false);
    setReview(null);
    setPickError(null);
  };

  const toReview = (e: MouseEvent<HTMLButtonElement>) => {
    const fd = new FormData(e.currentTarget.form!);
    const date = String(fd.get("date") ?? "");
    const minute = String(fd.get("startMinute") ?? "");
    if (!date || minute === "") {
      setPickError("Elige un día y una hora libre.");
      return;
    }
    const start = DateTime.fromISO(date, { zone: tz }).startOf("day").plus({ minutes: Number(minute) });
    if (start.toMillis() === current.toMillis()) {
      setPickError("Ya está en ese horario.");
      return;
    }
    setPickError(null);
    setReview({ startsAt: start.toISO()!, endsAt: start.plus({ minutes: durationMin }).toISO()! });
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      {open && (
        <Dialog title={review ? "Confirma el cambio" : title} onClose={close}>
          <ActionForm action={action} success={success} onDone={close} className="flex flex-col gap-5">
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}

            <div hidden={!!review} className="flex flex-col gap-5">
              <SlotPicker
                loadDay={loadDay}
                durationMin={durationMin}
                tz={tz}
                defaultDate={current.toFormat("yyyy-MM-dd")}
                defaultMinute={current.hour * 60 + current.minute}
                ignoreId={ignoreId}
              />
              <p className="text-sm text-bone-quiet">{pickerNote}</p>
              {pickError && (
                <p role="alert" className="label-sm text-sirena">
                  {pickError}
                </p>
              )}
              <div>
                <Button type="button" variant="secondary" size="sm" onClick={toReview}>
                  Revisar cambio
                </Button>
              </div>
            </div>

            {review && (
              <div className="flex flex-col gap-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 border-y hairline py-4 text-sm">
                  <dt className="label text-bone-quiet">{who.label}</dt>
                  <dd className="text-bone">{who.value}</dd>
                  <dt className="label text-bone-quiet">Antes</dt>
                  <dd className="text-bone-quiet line-through">{before}</dd>
                  <dt className="label text-bone-quiet">Ahora</dt>
                  <dd className="font-bold text-bone">{formatSessionWhen(review.startsAt, tz, { endsAt: review.endsAt })}</dd>
                  {rows.map((r) => (
                    <div key={r.label} className="contents">
                      <dt className="label text-bone-quiet">{r.label}</dt>
                      <dd className="text-bone-dim">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-3">
                  <SubmitButton size="sm" variant="primary" pendingLabel="Moviendo…">
                    Confirmar cambio
                  </SubmitButton>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReview(null)}>
                    Volver
                  </Button>
                </div>
              </div>
            )}
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
