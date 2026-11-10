import type { NotificationService } from "@/src/application/notifications/notification-service";

/** Horas tras el FIN de la sesión antes de pedir la reseña: misma tarde, ya fuera de la cabina. */
export const REVIEW_AFTER_HOURS = 3;
/** No pedir reseña de sesiones más viejas que esto: si el cron estuvo caído, no resucita lo de hace semanas. */
export const REVIEW_WINDOW_DAYS = 7;

/** Tipo de sesión completada, solo para afinar el copy del correo. */
export type ReviewVisit = "sala" | "prueba" | "curso";

export interface ReviewCandidate {
  reservationId: string;
  customerId: string;
  email: string;
  name: string | null;
  visit: ReviewVisit;
}

export interface ReviewRequestRepository {
  /**
   * Reservas completadas (hace ≥ REVIEW_AFTER_HOURS, dentro de REVIEW_WINDOW_DAYS) cuyo
   * cliente tiene email y aún no fue invitado a reseñar. El curso solo en su última sesión.
   */
  reviewsDue(now?: Date): Promise<ReviewCandidate[]>;
  /**
   * Reclama al cliente solo si aún no se le pidió: UNA reseña por cliente, para siempre.
   * true = esta corrida lo marcó (gana la carrera entre dos filas o dos corridas).
   */
  claimReviewRequested(customerId: string): Promise<boolean>;
  releaseReviewRequested(customerId: string): Promise<void>;
}

export interface ReviewSweepResult {
  sent: number;
  /** Clientes ya reclamados por otra fila de este mismo barrido (p. ej. dos reservas suyas): el dedupe. */
  skippedAlreadyAsked: number;
}

/**
 * Pide UNA reseña en Google por cliente, ~3 h después de su primera sesión completada
 * (sala, prueba o la última sesión del curso). Corre en el mismo pg_cron de 5 min que el
 * PIN y los recordatorios; mismo patrón: RECLAMAR el cliente antes de mandar, SOLTAR si falla.
 * El candado "una vez por cliente" vive en customers.review_requested_at, así los cuatro
 * disparos comparten un solo cerrojo sin contabilidad cruzada.
 */
export class ReviewRequestService {
  constructor(
    private readonly repo: ReviewRequestRepository,
    private readonly notifications: Pick<NotificationService, "notifyReviewRequest">,
  ) {}

  async sweep(now: Date = new Date()): Promise<ReviewSweepResult> {
    const result: ReviewSweepResult = { sent: 0, skippedAlreadyAsked: 0 };
    for (const c of await this.repo.reviewsDue(now)) {
      if (!(await this.repo.claimReviewRequested(c.customerId))) {
        result.skippedAlreadyAsked++;
        continue;
      }
      try {
        await this.notifications.notifyReviewRequest({ email: c.email, name: c.name, visit: c.visit });
        result.sent++;
      } catch (e) {
        console.error("[review-request:send]", c.reservationId, e);
        await this.repo
          .releaseReviewRequested(c.customerId)
          .catch((e2) => console.error("[review-request:release]", c.customerId, e2));
      }
    }
    return result;
  }
}
