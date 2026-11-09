/**
 * Calendario de la secuencia de nurture — puro, sin IO. Fuente ÚNICA del cadencia (día 2/5/9/14):
 * el barrido lo usa y los tests lo prueban, igual que `noticeDue()` del seguimiento de créditos.
 *
 * Los correos en sí viven en `templates.ts` (`nurtureTip`/`nurtureTrial`/`nurtureCourse`/
 * `nurtureCheckIn`); acá solo decidimos QUÉ paso toca y CUÁNDO.
 */

export type NurtureStep = "tip" | "trial" | "course" | "checkin";

/** Pasos en orden de cadencia. `afterDays` se mide desde `enrolledAt`. */
export const NURTURE_STEPS: readonly { key: NurtureStep; afterDays: number }[] = [
  { key: "tip", afterDays: 2 },
  { key: "trial", afterDays: 5 },
  { key: "course", afterDays: 9 },
  { key: "checkin", afterDays: 14 },
] as const;

/** Vista mínima de una ficha para decidir el paso. Lo arma el repo desde la fila `leads`. */
export interface NurtureLead {
  enrolledAt: string | null;
  consentAt: string | null;
  unsubscribedAt: string | null;
  tipSentAt: string | null;
  trialSentAt: string | null;
  courseSentAt: string | null;
  checkinSentAt: string | null;
}

const DAY_MS = 86_400_000;

/** El `*_sent_at` del paso. */
export function stepSentAt(lead: NurtureLead, step: NurtureStep): string | null {
  switch (step) {
    case "tip":
      return lead.tipSentAt;
    case "trial":
      return lead.trialSentAt;
    case "course":
      return lead.courseSentAt;
    case "checkin":
      return lead.checkinSentAt;
  }
}

/**
 * ¿Qué paso toca mandar AHORA? A lo más uno por barrido: el PRIMER paso sin enviar cuyo
 * día ya llegó. Como los pasos van en cadencia creciente, si el primer paso sin enviar
 * todavía no vence, ninguno posterior vence tampoco. Un atraso (cron caído) se pone al día
 * en barridos sucesivos, uno por vez.
 *
 * Devuelve null si no hay consentimiento, si se dio de baja, si falta `enrolledAt`, o si
 * no hay ningún paso vencido pendiente.
 */
export function nextStepDue(lead: NurtureLead, now: Date): NurtureStep | null {
  if (!lead.consentAt || lead.unsubscribedAt || !lead.enrolledAt) return null;
  const enrolled = new Date(lead.enrolledAt).getTime();
  if (Number.isNaN(enrolled)) return null;
  const t = now.getTime();
  for (const s of NURTURE_STEPS) {
    if (stepSentAt(lead, s.key)) continue;
    return enrolled + s.afterDays * DAY_MS <= t ? s.key : null;
  }
  return null;
}
