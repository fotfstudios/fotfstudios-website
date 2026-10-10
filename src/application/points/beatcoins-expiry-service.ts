import type { NotificationService } from "@/src/application/notifications/notification-service";

/**
 * Barrido diario del vencimiento de Beatcoins (cron /api/cron/notifications, 13:00):
 *   1. vence lo que ya cumplió 12 meses sin actividad (`expire_beatcoins`, idempotente);
 *   2. avisa lo que venció;
 *   3. avisa lo que vence en ≤ 7 días y luego en ≤ 30 días.
 * Mismo patrón que los otros barridos: reclamar antes de mandar y soltar el reclamo si el
 * envío falla (lo reintenta la corrida de mañana). A lo más un correo por cliente y corrida,
 * y un tope por corrida para no gatillar los límites del proveedor.
 */

export const MAX_EMAILS_PER_RUN = 100;

export type BeatcoinsNotice = "expired" | "n7" | "n30";

export interface BeatcoinsDueCandidate {
  customerId: string;
  email: string;
  name: string | null;
  expirable: number;
  protected: number;
  expiresAt: string;
}

export interface BeatcoinsExpiredCandidate {
  customerId: string;
  email: string;
  name: string | null;
  expired: number;
  remaining: number;
}

export interface BeatcoinsExpiryRepository {
  /** Vence lo vencido; devuelve a cuántos clientes. */
  expire(): Promise<number>;
  /** Vencimientos ya hechos con el aviso pendiente. */
  expiredPending(): Promise<BeatcoinsExpiredCandidate[]>;
  /** Vencen dentro de la ventana y el aviso de esa ventana no salió. */
  due(days: 7 | 30): Promise<BeatcoinsDueCandidate[]>;
  /** true = esta corrida marcó el aviso (estaba pendiente). */
  claim(customerId: string, notice: BeatcoinsNotice): Promise<boolean>;
  release(customerId: string, notice: BeatcoinsNotice): Promise<void>;
}

export interface BeatcoinsExpiryResult {
  expired: number;
  expiredNotices: number;
  notices7: number;
  notices30: number;
  failed: number;
}

export class BeatcoinsExpiryService {
  constructor(
    private readonly repo: BeatcoinsExpiryRepository,
    private readonly notifications: Pick<NotificationService, "notifyBeatcoinsExpiring" | "notifyBeatcoinsExpired">,
  ) {}

  async sweep(): Promise<BeatcoinsExpiryResult> {
    const result: BeatcoinsExpiryResult = { expired: 0, expiredNotices: 0, notices7: 0, notices30: 0, failed: 0 };
    result.expired = await this.repo.expire();
    const emailed = new Set<string>();
    const room = () => result.expiredNotices + result.notices7 + result.notices30 < MAX_EMAILS_PER_RUN;

    const send = async (customerId: string, notice: BeatcoinsNotice, deliver: () => Promise<void>): Promise<boolean> => {
      if (emailed.has(customerId) || !room()) return false;
      if (!(await this.repo.claim(customerId, notice))) return false;
      emailed.add(customerId);
      try {
        await deliver();
        return true;
      } catch (e) {
        result.failed++;
        console.error("[beatcoins-expiry:send]", customerId, notice, e);
        await this.repo.release(customerId, notice).catch((e2) => console.error("[beatcoins-expiry:release]", customerId, e2));
        return false;
      }
    };

    for (const c of await this.repo.expiredPending()) {
      const ok = await send(c.customerId, "expired", () =>
        this.notifications.notifyBeatcoinsExpired({ email: c.email, name: c.name, expired: c.expired, remaining: c.remaining }),
      );
      if (ok) result.expiredNotices++;
    }
    for (const days of [7, 30] as const) {
      for (const c of await this.repo.due(days)) {
        const ok = await send(c.customerId, days === 7 ? "n7" : "n30", () =>
          this.notifications.notifyBeatcoinsExpiring({
            email: c.email,
            name: c.name,
            expiring: c.expirable,
            permanent: c.protected,
            expiresAt: c.expiresAt,
          }),
        );
        if (ok) result[days === 7 ? "notices7" : "notices30"]++;
      }
    }
    return result;
  }
}
