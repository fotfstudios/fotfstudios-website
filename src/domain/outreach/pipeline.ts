/**
 * Embudo del lead — etapas y reglas de transición, puro. Espejo del CHECK `leads_stage_valid`
 * y de la función `lead_advance_stage` de la migración (dos sitios, misma regla, cada uno con
 * su test para que no se desincronicen).
 */

export const LEAD_STAGES = ["nuevo", "contactado", "interesado", "ganado", "perdido"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABELS: Record<LeadStage, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  ganado: "Ganado",
  perdido: "Perdido",
};

export function isLeadStage(v: unknown): v is LeadStage {
  return typeof v === "string" && (LEAD_STAGES as readonly string[]).includes(v);
}

// 'ganado' y 'perdido' comparten rango: ambos son el final del embudo. 'perdido' es solo-manual.
const RANK: Record<LeadStage, number> = { nuevo: 0, contactado: 1, interesado: 2, ganado: 3, perdido: 3 };

/** Etapas que un evento automático (pago, primer correo) puede fijar. 'perdido' nunca. */
export type AutoStage = "contactado" | "interesado" | "ganado";

/**
 * Transición AUTOMÁTICA: devuelve el destino si corresponde avanzar, o null si no.
 * Solo hacia adelante; nunca toca una ficha ya `ganado`/`perdido`; `perdido` es solo-manual.
 */
export function advanceStage(current: LeadStage, target: AutoStage): AutoStage | null {
  if (current === "ganado" || current === "perdido") return null;
  return RANK[target] > RANK[current] ? target : null;
}
