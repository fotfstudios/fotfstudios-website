"use client";

import { ActionForm } from "@/components/admin/ui/ActionForm";
import { assignLeadAction } from "../actions";

const selectCls =
  "border border-ink-edge bg-ink px-2 py-1 font-mono text-xs text-bone outline-none transition-colors hover:border-gold/60 focus-visible:border-gold";

/** Asigna un responsable (o lo quita con "Sin asignar"). Envía al cambiar. */
export function AssigneeSelect({
  email,
  assigneeId,
  members,
}: {
  email: string;
  assigneeId: string | null;
  members: { id: string; email: string }[];
}) {
  return (
    <ActionForm action={assignLeadAction} success="Asignación actualizada.">
      <input type="hidden" name="email" value={email} />
      <select
        name="memberId"
        defaultValue={assigneeId ?? ""}
        aria-label="Asignar a"
        className={selectCls}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Sin asignar</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.email}
          </option>
        ))}
      </select>
    </ActionForm>
  );
}
