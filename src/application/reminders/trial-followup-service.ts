import type { NotificationService } from "@/src/application/notifications/notification-service";

/**
 * Los dos correos de seguimiento del crédito de una prueba del curso, en el mismo
 * barrido de 5 minutos que el PIN y los recordatorios:
 *   · `followup` — el día DESPUÉS de la prueba ("¿te animas?", con hasta cuándo vale).
 *   · `expiring` — dos días antes de que venza el crédito.
 * Solo para créditos vivos (sin usar, sin anular, sin vencer). Mismo patrón que los
 * otros barridos: reclamar antes de mandar y soltar el reclamo si el envío falla.
 */

/** Horas después del FIN de la prueba para el seguimiento: cae a la mañana siguiente. */
export const FOLLOWUP_AFTER_HOURS = 16;
/** Horas antes del vencimiento para el aviso. */
export const EXPIRY_NOTICE_HOURS = 48;

export type TrialCreditNotice = "followup" | "expiring";

export interface TrialCreditCandidate {
  id: string;
  email: string;
  name: string | null;
  amount: number;
  expiresAt: string;
  /** Fin de la prueba de origen; null en un crédito emitido a mano (sin reserva). */
  sessionEndsAt: string | null;
  followupSentAt: string | null;
  expiryReminderSentAt: string | null;
}

/** ¿Toca este aviso ahora? Puro: lo usa el barrido y lo prueban los tests. */
export function noticeDue(c: TrialCreditCandidate, notice: TrialCreditNotice, now: Date): boolean {
  const t = now.getTime();
  const expires = new Date(c.expiresAt).getTime();
  if (expires <= t) return false; // vencido: ya no hay descuento que ofrecer
  if (notice === "followup") {
    // Un crédito emitido a mano (prueba vieja, sin reserva) no tiene "día después".
    if (c.followupSentAt || !c.sessionEndsAt) return false;
    return new Date(c.sessionEndsAt).getTime() + FOLLOWUP_AFTER_HOURS * 3600_000 <= t;
  }
  if (c.expiryReminderSentAt) return false;
  return expires - EXPIRY_NOTICE_HOURS * 3600_000 <= t;
}

export interface TrialCreditRepository {
  /** Créditos vivos (sin usar ni anular) con algún aviso pendiente. */
  liveCandidates(): Promise<TrialCreditCandidate[]>;
  /** Reclama el aviso solo si estaba pendiente. true = esta corrida lo marcó. */
  claim(creditId: string, notice: TrialCreditNotice): Promise<boolean>;
  release(creditId: string, notice: TrialCreditNotice): Promise<void>;
}

export interface TrialFollowUpResult {
  followups: number;
  expiring: number;
}

export class TrialFollowUpService {
  constructor(
    private readonly repo: TrialCreditRepository,
    private readonly notifications: Pick<NotificationService, "notifyTrialCredit">,
  ) {}

  async sweep(now: Date = new Date()): Promise<TrialFollowUpResult> {
    const result: TrialFollowUpResult = { followups: 0, expiring: 0 };
    for (const c of await this.repo.liveCandidates()) {
      // A lo más un correo por crédito y corrida: si justo tocan los dos, el seguimiento
      // sale primero y el aviso de vencimiento en la corrida siguiente.
      const notice: TrialCreditNotice | null = noticeDue(c, "followup", now)
        ? "followup"
        : noticeDue(c, "expiring", now)
          ? "expiring"
          : null;
      if (!notice) continue;
      if (!(await this.repo.claim(c.id, notice))) continue;
      try {
        await this.notifications.notifyTrialCredit(notice, {
          email: c.email,
          name: c.name,
          amount: c.amount,
          expiresAt: c.expiresAt,
        });
        if (notice === "followup") result.followups++;
        else result.expiring++;
      } catch (e) {
        console.error("[trial-followup:send]", c.id, notice, e);
        await this.repo.release(c.id, notice).catch((e2) => console.error("[trial-followup:release]", c.id, e2));
      }
    }
    return result;
  }
}
