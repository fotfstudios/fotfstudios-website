"use client";

import { type MouseEvent, useCallback, useState } from "react";
import { DateTime } from "luxon";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { formatSessionWhen } from "@/src/application/notifications/format-when";
import { getRescheduleDayAction, moveTrialAction } from "../actions";

/**
 * Mover la prueba del curso: solo día y hora (dura siempre 1 h y el precio no cambia, así
 * que no hay cotización ni delta como en "Reagendar"). El selector muestra la ocupación real
 * sin contar la propia prueba.
 *
 * Dos pasos: elegir → revisar el resumen → confirmar. "Revisar" NO envía el form (React 19
 * lo limpia al enviar y se perdería la hora elegida): lee la selección y esconde el picker,
 * que sigue montado con sus valores; "Volver" lo muestra igual. Solo "Confirmar" envía.
 */
export function MoverPruebaDialog({
  reservationId,
  tz,
  startsAt,
  endsAt,
  customerName,
  customerEmail,
}: {
  reservationId: string;
  tz: string;
  /** Horario actual (ISO): el picker abre en ese día/hora y el resumen lo muestra como "antes". */
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  customerEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<{ startsAt: string; endsAt: string } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const loadDay = useCallback((d: string) => getRescheduleDayAction(reservationId, d), [reservationId]);

  const current = DateTime.fromISO(startsAt).setZone(tz);
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
      setPickError("La prueba ya está en ese horario.");
      return;
    }
    setPickError(null);
    setReview({ startsAt: start.toISO()!, endsAt: start.plus({ hours: 1 }).toISO()! });
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Mover prueba
      </Button>
      {open && (
        <Dialog title={review ? "Confirma el cambio" : "Mover la prueba del curso"} onClose={close}>
          <ActionForm
            action={moveTrialAction}
            success="Prueba movida. Le avisamos al cliente."
            onDone={close}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="reservationId" value={reservationId} />

            <div hidden={!!review} className="flex flex-col gap-5">
              <SlotPicker
                loadDay={loadDay}
                durationMin={60}
                tz={tz}
                defaultDate={current.toFormat("yyyy-MM-dd")}
                defaultMinute={current.hour * 60 + current.minute}
                ignoreId={reservationId}
              />
              <p className="text-sm text-bone-quiet">Sigue durando 1 hora y el precio no cambia.</p>
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
                  <dt className="label text-bone-quiet">Cliente</dt>
                  <dd className="text-bone">{customerName ?? "Sin nombre"}</dd>
                  <dt className="label text-bone-quiet">Antes</dt>
                  <dd className="text-bone-quiet line-through">{before}</dd>
                  <dt className="label text-bone-quiet">Ahora</dt>
                  <dd className="font-bold text-bone">{formatSessionWhen(review.startsAt, tz, { endsAt: review.endsAt })}</dd>
                  <dt className="label text-bone-quiet">Cobro</dt>
                  <dd className="text-bone-dim">Sin cobro ni reembolso · 1 hora</dd>
                  <dt className="label text-bone-quiet">Avisos</dt>
                  <dd className="text-bone-dim">
                    {customerEmail
                      ? `Correo a ${customerEmail} con el nuevo horario, y a ti.`
                      : "El cliente no tiene email: avísale tú. A ti te llega el correo."}
                  </dd>
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
