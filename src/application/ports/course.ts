/** Puertos del Curso de DJ. Vocabulario de dominio (camelCase); el adapter traduce. */
import type { CourseLeadStatus, CoursePrices, GenerationStatus } from "@/src/domain/course/course";
import type { CourseLeadInput } from "@/src/domain/course/lead";
import type { SolicitudTab, SolicitudesListQuery } from "@/src/domain/admin/curso-solicitudes-list";
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

/** Una generación con su aritmética de cupos ya resuelta. */
export interface CourseGenerationView {
  id: string;
  code: string;
  name: string;
  status: GenerationStatus;
  seats: number;
  seatsTaken: number;
  seatsLeft: number;
  prices: CoursePrices;
  pricingLabel: string | null;
  enrollDeadline: string | null;
  startsOn: string | null;
  createdAt: string;
}

export interface NewGeneration {
  code: string;
  name: string;
  seats: number;
  prices: CoursePrices;
  pricingLabel?: string | null;
  enrollDeadline?: string | null;
  startsOn?: string | null;
}

export interface CourseGenerationRepository {
  listGenerations(): Promise<CourseGenerationView[]>;
  /** La generación vigente: la abierta, o la que está dictándose. */
  currentGeneration(): Promise<CourseGenerationView | null>;
  getGeneration(id: string): Promise<CourseGenerationView | null>;
  createGeneration(input: NewGeneration): Promise<string>;
  setGenerationStatus(id: string, status: GenerationStatus): Promise<void>;
}

export interface CourseLeadRow extends CourseLeadInput {
  id: string;
  status: CourseLeadStatus;
  generationId: string | null;
  createdAt: string;
}

export interface CourseLeadsListResult {
  rows: CourseLeadRow[];
  total: number;
  tabCounts: Record<SolicitudTab, number>;
  grandTotal: number;
}

export interface CourseLeadRepository {
  /** Alta pública. `generationId` estampa la generación vigente al enviar. */
  createLead(input: CourseLeadInput, generationId: string | null): Promise<string>;
  listLeads(q: SolicitudesListQuery): Promise<CourseLeadsListResult>;
  getLead(id: string): Promise<CourseLeadRow | null>;
  updateLeadStatus(id: string, status: CourseLeadStatus): Promise<void>;
  /** Badge de la barra lateral. */
  nuevasCount(): Promise<number>;
}
