import type { NotificationService } from "@/src/application/notifications/notification-service";
import type { LeadsRepository } from "@/src/application/ports/outreach";
import { nextStepDue } from "@/src/domain/outreach/nurture-schedule";

/**
 * Motor de nurture: en cada barrido (cron de 5 min) manda, a lo más, UN paso por lead —
 * el que toque según `nextStepDue`. Mismo patrón que TrialFollowUpService: reclamar antes de
 * mandar y soltar el reclamo si el envío falla, así un cron que se cae no re-spamea.
 *
 * Al enviar deja un toque `nurture_sent` y empuja el embudo nuevo→contactado (avance
 * automático, hacia adelante; no toca una ficha ya movida a mano). Esos dos son accesorios:
 * si fallan, el correo ya salió y el paso queda reclamado — se loguea y se sigue.
 */
export class NurtureService {
  constructor(
    private readonly repo: Pick<LeadsRepository, "candidates" | "claimStep" | "releaseStep" | "recordTouch" | "advance">,
    private readonly notifications: Pick<NotificationService, "notifyNurtureStep">,
  ) {}

  async sweep(now: Date = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    for (const lead of await this.repo.candidates()) {
      const step = nextStepDue(lead, now);
      if (!step) continue;
      if (!(await this.repo.claimStep(lead.id, step))) continue;
      try {
        await this.notifications.notifyNurtureStep(step, {
          email: lead.email,
          name: lead.name,
          token: lead.unsubscribeToken,
        });
      } catch (e) {
        console.error("[nurture:send]", lead.id, step, e);
        await this.repo.releaseStep(lead.id, step).catch((e2) => console.error("[nurture:release]", lead.id, e2));
        continue;
      }
      sent++;
      // Accesorios post-envío: su falla no re-encola el correo (ya salió).
      await this.repo.recordTouch(lead.email, "nurture_sent", { step }).catch((e) => console.error("[nurture:touch]", lead.id, e));
      await this.repo.advance(lead.email, "contactado").catch((e) => console.error("[nurture:advance]", lead.id, e));
    }
    return { sent };
  }
}
