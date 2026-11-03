"use client";

import { ActionForm } from "@/components/admin/ui/ActionForm";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { inputCls } from "@/components/admin/ui/styles";
import { setLeadNotesAction } from "../actions";

/** Notas libres del lead (contexto manual del dueño). */
export function NotesForm({ email, notes }: { email: string; notes: string | null }) {
  return (
    <ActionForm action={setLeadNotesAction} success="Notas guardadas." className="flex flex-col gap-2">
      <input type="hidden" name="email" value={email} />
      <textarea
        name="notes"
        rows={4}
        maxLength={2000}
        defaultValue={notes ?? ""}
        placeholder="Contexto, próximos pasos, lo que se habló…"
        className={inputCls}
      />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Guardando…">
        Guardar notas
      </SubmitButton>
    </ActionForm>
  );
}
