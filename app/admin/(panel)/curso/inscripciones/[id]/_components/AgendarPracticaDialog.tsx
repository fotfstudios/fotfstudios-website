"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { practiceDurations, practiceHoursLabel } from "@/src/domain/course/practice";
import { courseDayAction, redeemPracticeAction } from "../../../actions";

/**
 * Agenda horas de práctica libre contra el saldo, en medias horas (mínimo 1 h). Las horas
 * van primero porque cambian qué inicios alcanzan: 2 h a las 15:00 puede chocar donde 1 h no.
 * Diálogo y no formulario en línea: la tarjeta vive en la columna angosta.
 */
export function AgendarPracticaDialog({
  enrollmentId,
  libres,
  tz,
}: {
  enrollmentId: string;
  libres: number;
  tz: string;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(1);

  return (
    <>
      <Button variant="secondary" size="sm" icon="add" onClick={() => setOpen(true)}>
        Agendar práctica
      </Button>
      {open && (
        <Dialog title="Agendar práctica libre" onClose={() => setOpen(false)}>
          <ActionForm
            action={redeemPracticeAction}
            success="Práctica agendada."
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <Field label="Duración" hint={`Le ${libres === 1 ? "queda" : "quedan"} ${practiceHoursLabel(libres)}.`}>
              <Select name="hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {practiceDurations(libres).map((h) => (
                  <option key={h} value={h}>
                    {practiceHoursLabel(h)}
                  </option>
                ))}
              </Select>
            </Field>
            <SlotPicker loadDay={courseDayAction} durationMin={hours * 60} tz={tz} />
            <div>
              <SubmitButton pendingLabel="Agendando…">Agendar práctica</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
