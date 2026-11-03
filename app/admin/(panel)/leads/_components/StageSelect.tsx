"use client";

import { ActionForm } from "@/components/admin/ui/ActionForm";
import { LEAD_STAGES, STAGE_LABELS, type LeadStage } from "@/src/domain/outreach/pipeline";
import { setLeadStageAction } from "../actions";

const selectCls =
  "border border-ink-edge bg-ink px-2 py-1 font-mono text-xs text-bone outline-none transition-colors hover:border-gold/60 focus-visible:border-gold";

/**
 * Mover la etapa del embudo: un <select> nativo que envía al cambiar (la "mover a…" accesible,
 * fuente de verdad en la tabla y en el tablero). Sin librería de arrastre: el teclado y el
 * lector de pantalla lo manejan gratis.
 */
export function StageSelect({ email, stage }: { email: string; stage: LeadStage }) {
  return (
    <ActionForm action={setLeadStageAction} success="Etapa actualizada.">
      <input type="hidden" name="email" value={email} />
      <select
        name="stage"
        defaultValue={stage}
        aria-label="Mover a etapa"
        className={selectCls}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    </ActionForm>
  );
}
