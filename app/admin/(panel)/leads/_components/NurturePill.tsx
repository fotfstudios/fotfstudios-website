import { nurtureStatus } from "@/src/domain/admin/leads-list";
import type { NurtureLead } from "@/src/domain/outreach/nurture-schedule";

const TONE = {
  no_inscrito: "text-bone-quiet",
  activo: "text-bone-dim",
  completo: "text-gold",
  baja: "text-bone-quiet",
} as const;
const DOT = {
  no_inscrito: "bg-bone-mute",
  activo: "bg-bone-dim",
  completo: "bg-gold",
  baja: "bg-bone-mute",
} as const;

/** Estado de la secuencia de nurture (no StatusPill: sus claves son distintas del embudo). */
export function NurturePill({ lead }: { lead: NurtureLead }) {
  const { state, label } = nurtureStatus(lead);
  return (
    <span className={`inline-flex items-center gap-1.5 border hairline px-2 py-0.5 label-sm ${TONE[state]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
      {label}
    </span>
  );
}
