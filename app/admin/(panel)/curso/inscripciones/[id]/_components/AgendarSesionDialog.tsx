"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { courseDayAction, scheduleSessionAction } from "../../../actions";

/**
 * Agenda UNA sesión "por agendar" en la fecha que se acordó con el alumno. La sala
 * se toma recién acá: las sesiones sin fecha no bloquean nada.
 */
export function AgendarSesionDialog({
  enrollmentId,
  n,
  title,
  tz,
}: {
  enrollmentId: string;
  n: number;
  title: string;
  tz: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Agendar
      </Button>
      {open && (
        <Dialog title={`Agendar sesión ${n} · ${title}`} onClose={() => setOpen(false)}>
          <ActionForm
            action={scheduleSessionAction}
            success={`Sesión ${n} agendada.`}
            onDone={() => setOpen(false)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <input type="hidden" name="n" value={n} />
            <SlotPicker loadDay={courseDayAction} durationMin={COURSE_PROGRAM.sessionMinutes} tz={tz} />
            <div>
              <SubmitButton pendingLabel="Agendando…">Agendar sesión {n}</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </>
  );
}
