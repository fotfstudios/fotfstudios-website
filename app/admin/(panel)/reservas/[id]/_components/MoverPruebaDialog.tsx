"use client";

import { useCallback, useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { getRescheduleDayAction, moveTrialAction } from "../actions";

/**
 * Mover la prueba del curso: solo día y hora (dura siempre 1 h y el precio no cambia, así
 * que no hay cotización ni delta como en "Reagendar"). El selector muestra la ocupación real
 * sin contar la propia prueba. Al guardar, al dueño y al cliente les llega el aviso.
 */
export function MoverPruebaDialog({
  reservationId,
  tz,
  date,
  startMinute,
}: {
  reservationId: string;
  tz: string;
  /** Día y minuto actuales (hora local): el picker abre ahí. */
  date: string;
  startMinute: number;
}) {
  const [open, setOpen] = useState(false);
  const loadDay = useCallback((d: string) => getRescheduleDayAction(reservationId, d), [reservationId]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Mover prueba
      </Button>
      {open && (
        <Dialog title="Mover la prueba del curso" onClose={() => setOpen(false)}>
          <ActionForm
            action={moveTrialAction}
            success="Prueba movida. Le avisamos al cliente."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="reservationId" value={reservationId} />
            <SlotPicker
              loadDay={loadDay}
              durationMin={60}
              tz={tz}
              defaultDate={date}
              defaultMinute={startMinute}
              ignoreId={reservationId}
            />
            <p className="text-sm text-bone-quiet">
              Sigue durando 1 hora y el precio no cambia. Al cliente le llega el nuevo horario por correo.
            </p>
            <div>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Moviendo…">
                Mover
              </SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
