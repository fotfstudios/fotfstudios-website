import type { ApplicationInput, ApplicationStatus } from "@/src/domain/applications/application";
import type { PostulacionTab, PostulacionesListQuery } from "@/src/domain/admin/postulaciones-list";

/** Una postulación tal como la lee el admin (input normalizado + metadatos de la DB). */
export interface ApplicationRow extends ApplicationInput {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
}

export interface ApplicationsListResult {
  rows: ApplicationRow[];
  /** Total del tab activo (== tabCounts para el estado del tab, o la suma en "todas"). */
  total: number;
  /** Conteo por tab — los "KPIs" de la lista, nada más. */
  tabCounts: Record<PostulacionTab, number>;
}

export interface ApplicationRepository {
  createApplication(input: ApplicationInput): Promise<string>;
  listApplications(q: PostulacionesListQuery): Promise<ApplicationsListResult>;
  updateStatus(id: string, status: ApplicationStatus): Promise<void>;
}
