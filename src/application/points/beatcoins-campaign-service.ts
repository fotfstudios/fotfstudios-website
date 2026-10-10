import { DateTime } from "luxon";
import type { NotificationService } from "@/src/application/notifications/notification-service";
import { BEATCOINS_EXPIRY_FROM } from "@/src/domain/points/expiry";

/**
 * Campaña de Beatcoins, en el cron diario de notificaciones:
 *   · Anuncio del cambio (una vez por cliente): el dueño lo ENCOLA desde /admin/clientes y
 *     el barrido lo manda en tandas. Es aviso de cambio de términos → transaccional.
 *   · Resumen mensual (opt-out, decisión del dueño 2026-10-10): una vez por mes calendario
 *     de Chile, desde el corte, a quien tiene saldo y no se dio de baja. Lleva link de baja y
 *     List-Unsubscribe de un clic. No sale si el anuncio salió hace menos de 20 días.
 * Claim → envío → release si falla, como los otros barridos, y un tope por corrida
 * compartido entre los dos.
 */

export const CAMPAIGN_MAX_PER_RUN = 100;
export const DIGEST_SKIP_AFTER_LAUNCH_DAYS = 20;
const TZ = "America/Santiago";

export interface CampaignCandidate {
  customerId: string;
  email: string;
  name: string | null;
  balance: number;
  protected: number;
  activityAt: string | null;
  unsubscribeToken: string;
  /** Para soltar el reclamo del resumen: el valor que tenía antes de reclamarlo. */
  digestSentAt: string | null;
}

export interface BeatcoinsCampaignRepository {
  /** Clientes a los que les llegaría el anuncio y todavía no está en cola ni enviado. */
  launchAudience(): Promise<number>;
  /** Encola el anuncio para esa audiencia; devuelve cuántos. */
  queueLaunch(): Promise<number>;
  launchStatus(): Promise<{ queued: number; sent: number }>;
  launchPending(limit: number): Promise<CampaignCandidate[]>;
  /** Con saldo, sin baja, sin resumen este mes y sin anuncio reciente. */
  digestPending(monthStart: string, launchSince: string, limit: number): Promise<CampaignCandidate[]>;
  claimLaunch(customerId: string): Promise<boolean>;
  releaseLaunch(customerId: string): Promise<void>;
  claimDigest(customerId: string, monthStart: string): Promise<boolean>;
  releaseDigest(customerId: string, previous: string | null): Promise<void>;
  /** Baja del resumen por token (link del correo). true = el token existe. */
  unsubscribeDigest(token: string): Promise<boolean>;
}

export interface BeatcoinsCampaignResult {
  launch: number;
  digest: number;
  failed: number;
}

/** Inicio del mes calendario de Chile, en UTC: la marca de "ya recibió el resumen este mes". */
export function digestMonthStart(now: Date): string {
  return DateTime.fromJSDate(now).setZone(TZ).startOf("month").toUTC().toISO()!;
}

export class BeatcoinsCampaignService {
  constructor(
    private readonly repo: BeatcoinsCampaignRepository,
    private readonly notifications: Pick<NotificationService, "notifyBeatcoinsLaunch" | "notifyBeatcoinsDigest">,
    private readonly expiryFrom: string = BEATCOINS_EXPIRY_FROM,
  ) {}

  async sweep(now: Date = new Date()): Promise<BeatcoinsCampaignResult> {
    const result: BeatcoinsCampaignResult = { launch: 0, digest: 0, failed: 0 };
    const left = () => CAMPAIGN_MAX_PER_RUN - result.launch - result.digest - result.failed;

    for (const c of await this.repo.launchPending(left())) {
      if (left() <= 0) break;
      if (!(await this.repo.claimLaunch(c.customerId))) continue;
      try {
        await this.notifications.notifyBeatcoinsLaunch(c);
        result.launch++;
      } catch (e) {
        result.failed++;
        console.error("[beatcoins-campaign:launch]", c.customerId, e);
        await this.repo.releaseLaunch(c.customerId).catch((e2) => console.error("[beatcoins-campaign:release]", e2));
      }
    }

    // El resumen arranca con el corte: antes no hay nada que vencer que contar.
    if (now < new Date(this.expiryFrom) || left() <= 0) return result;
    const month = digestMonthStart(now);
    const launchSince = new Date(now.getTime() - DIGEST_SKIP_AFTER_LAUNCH_DAYS * 86_400_000).toISOString();
    for (const c of await this.repo.digestPending(month, launchSince, left())) {
      if (left() <= 0) break;
      if (!(await this.repo.claimDigest(c.customerId, month))) continue;
      try {
        await this.notifications.notifyBeatcoinsDigest(c);
        result.digest++;
      } catch (e) {
        result.failed++;
        console.error("[beatcoins-campaign:digest]", c.customerId, e);
        await this.repo
          .releaseDigest(c.customerId, c.digestSentAt)
          .catch((e2) => console.error("[beatcoins-campaign:release]", e2));
      }
    }
    return result;
  }
}
