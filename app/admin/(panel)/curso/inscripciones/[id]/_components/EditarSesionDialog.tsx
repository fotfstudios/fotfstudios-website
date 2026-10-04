"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { hhmm } from "@/components/booking/format";
import { moveSessionAction, setSessionInstructorAction } from "../../../actions";

/**
 * Una sesión se edita en un solo diálogo: la fecha/hora (mover, o re-agendar si
 * estaba cancelada — el RPC distingue) y su instructor. La duración no se elige:
 * siempre es la del programa.
 */
export function EditarSesionDialog({
  enrollmentId,
  session,
  starts,
}: {
  enrollmentId: string;
  session: { id: string; n: number; title: string; status: string; date: string | null; startMinute: number | null; instructor: string | null };
  /** Horas de inicio ofrecidas (minutos del día). */
  starts: number[];
}) {
  const [open, setOpen] = useState(false);
  const cancelada = session.status === "cancelada";

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {cancelada ? "Reagendar" : "Editar"}
      </Button>
      {open && (
        <Dialog title={`Sesión ${session.n} · ${session.title}`} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-8">
            <ActionForm
              action={moveSessionAction}
              success={cancelada ? "Sesión re-agendada." : "Sesión movida."}
              onDone={() => setOpen(false)}
              className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
            >
              <input type="hidden" name="enrollmentId" value={enrollmentId} />
              <input type="hidden" name="sessionId" value={session.id} />
              <Field label="Día">
                <Input type="date" name="date" required defaultValue={session.date ?? ""} />
              </Field>
              <Field label="Hora">
                <Select name="startMinute" defaultValue={session.startMinute ?? starts[0]}>
                  {starts.map((m) => (
                    <option key={m} value={m}>
                      {hhmm(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="pb-1">
                <SubmitButton size="sm" variant="secondary" pendingLabel="Guardando…">
                  {cancelada ? "Reagendar" : "Mover"}
                </SubmitButton>
              </div>
            </ActionForm>

            <ActionForm
              action={setSessionInstructorAction}
              success="Instructor guardado."
              onDone={() => setOpen(false)}
              className="grid gap-4 border-t hairline pt-6 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <input type="hidden" name="enrollmentId" value={enrollmentId} />
              <input type="hidden" name="sessionId" value={session.id} />
              <Field label="Instructor de esta sesión" hint="Vacío = sin asignar.">
                <Input name="instructor" maxLength={60} defaultValue={session.instructor ?? ""} />
              </Field>
              <div className="pb-1">
                <SubmitButton size="sm" variant="secondary" pendingLabel="Guardando…">
                  Guardar
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Dialog>
      )}
    </>
  );
}
