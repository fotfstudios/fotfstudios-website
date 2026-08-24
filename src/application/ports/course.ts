/** Puertos del Curso de DJ. Vocabulario de dominio (camelCase); el adapter traduce. */
import type { CourseSessionPlan } from "@/src/domain/course/sessions";

export interface CourseSessionRow {
  id: string;
  n: number;
  title: string;
  status: string;
  reservationId: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** Un choque entre una sesión propuesta y lo que ya hay en la sala. */
export interface CourseConflict {
  n: number;
  startsAt: string;
  endsAt: string;
  kind: string;
  status: string;
  customerName: string | null;
  amountClp: number | null;
}

export interface CourseSchedulingRepository {
  /** Read-only: qué choca con este plan, sin escribir nada. */
  previewConflicts(resourceId: string, plan: readonly CourseSessionPlan[]): Promise<CourseConflict[]>;
  /** Agenda TODAS las sesiones o ninguna. Devuelve cuántas creó. */
  scheduleSessions(generationId: string, plan: readonly CourseSessionPlan[], createdBy?: string): Promise<number>;
  moveSession(sessionId: string, startsAt: string, endsAt: string, createdBy?: string): Promise<void>;
  cancelSession(sessionId: string, createdBy?: string): Promise<void>;
  listSessions(generationId: string): Promise<CourseSessionRow[]>;
}
