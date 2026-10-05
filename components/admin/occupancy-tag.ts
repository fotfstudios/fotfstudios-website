import { isCourseSession, isMaintenanceBlock } from "@/src/domain/scheduling/reservation-kind";

/**
 * Rótulo de un horario tomado en los selectores de hora del admin (consola de reserva
 * y reagendar). Antes la sesión guiada del curso salía como "bloqueo", igual que una
 * mantención: ahora dice "curso". Un bloqueo de mantención gana si hay ambos.
 */
export function occupancyTag(hits: { kind: string }[]): "bloqueo" | "curso" | "ocupado" {
  if (hits.some((o) => isMaintenanceBlock(o.kind))) return "bloqueo";
  if (hits.some((o) => isCourseSession(o.kind))) return "curso";
  return "ocupado";
}
