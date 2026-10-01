import { createHash } from "node:crypto";
import type { CalendarSync, CalendarSyncRepository } from "@/src/application/ports/calendar";
import { canonicalJson, decideOutcome, googleEventId, toGoogleEvent } from "@/src/domain/calendar/google-event";

export interface SweepResult {
  /** false = faltan GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_CALENDAR_ID: no se reclamó nada. */
  configured: boolean;
  claimed: number;
  upserted: number;
  deleted: number;
  /** Encoladas sin cambio real (mismo fingerprint): no se llamó a Google. */
  skipped: number;
  failed: number;
  /** Reclamadas que no alcanzaron dentro del presupuesto: vuelven a la cola sin contar intento. */
  released: number;
}

const EMPTY: Omit<SweepResult, "configured"> = { claimed: 0, upserted: 0, deleted: 0, skipped: 0, failed: 0, released: 0 };

/** 1, 2, 4, 8, 16, 32, 60, 60… minutos. Sin tope de intentos: la tabla de errores del admin es la "dead letter". */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.min(attempts, 6));
}

/**
 * Worker del espejo de la agenda en Google Calendar (spec 2026-10-01). Lo dispara pg_cron
 * cada minuto vía /api/cron/calendar-sync, y el botón "Sincronizar ahora" del admin.
 *
 * Una fila a la vez, secuencial (Google pide ≤ 10 req/s; 25 filas por tick sobran). Cada fila
 * en su propio try/catch: una que falla no frena a las demás. Nunca lanza por una fila.
 */
export class CalendarSyncService {
  private readonly now: () => Date;

  constructor(
    private readonly repo: CalendarSyncRepository,
    /** null = sin credenciales. */
    private readonly calendar: CalendarSync | null,
    private readonly opts: { siteUrl: string; now?: () => Date },
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * `budgetMs` mantiene el tick bajo el timeout de pg_net (15 s): lo que no alcanza se suelta
   * para el próximo minuto.
   */
  async sweep({ limit = 25, budgetMs = 10_000 }: { limit?: number; budgetMs?: number } = {}): Promise<SweepResult> {
    // Sin credenciales NO se reclama: un adaptador no-op marcaría filas como sincronizadas sin
    // evento, y nada las volvería a mandar cuando se configure.
    const calendar = this.calendar;
    if (!calendar) return { configured: false, ...EMPTY };

    const started = this.now().getTime();
    const rows = await this.repo.claimDue(limit);
    const r: SweepResult = { configured: true, ...EMPTY, claimed: rows.length };

    for (const row of rows) {
      if (this.now().getTime() - started >= budgetMs) {
        await this.repo.release(row.reservationId).catch((e) => console.error("[calendar-sync:release]", row.reservationId, e));
        r.released++;
        continue;
      }
      try {
        const snapshot = await this.repo.snapshot(row.reservationId);
        const eventId = googleEventId(row.reservationId);
        if (decideOutcome(snapshot, this.now()) === "delete") {
          await calendar.deleteEvent(eventId);
          await this.repo.markSynced(row.reservationId, row.version, { googleEventId: null, fingerprint: null, gone: snapshot === null });
          r.deleted++;
          continue;
        }
        const payload = toGoogleEvent(snapshot!, { siteUrl: this.opts.siteUrl });
        const fingerprint = createHash("sha256").update(canonicalJson(payload)).digest("hex");
        if (fingerprint === row.lastFingerprint) {
          r.skipped++;
        } else {
          await calendar.upsertEvent(eventId, payload);
          r.upserted++;
        }
        await this.repo.markSynced(row.reservationId, row.version, { googleEventId: eventId, fingerprint, gone: false });
      } catch (e) {
        r.failed++;
        const message = e instanceof Error ? e.message : String(e);
        console.error("[calendar-sync]", row.reservationId, message);
        const next = new Date(this.now().getTime() + backoffMinutes(row.attempts) * 60_000);
        await this.repo.markFailed(row.reservationId, row.version, message, next).catch((e2) => console.error("[calendar-sync:mark-failed]", row.reservationId, e2));
      }
    }
    return r;
  }

  /** "Sincronizar ahora": adelanta todo lo pendiente (incluidas las filas en backoff) y barre. */
  async syncNow(): Promise<SweepResult> {
    if (!this.calendar) return { configured: false, ...EMPTY };
    await this.repo.forceDue();
    return this.sweep({ budgetMs: 25_000 });
  }

  /** "Resincronizar todo": re-encola lo vigente con el fingerprint limpio (fuerza el PATCH). */
  resyncAll(): Promise<number> {
    return this.repo.enqueueAll();
  }
}
