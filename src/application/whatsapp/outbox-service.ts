import { WhatsAppSendError, type WhatsAppSender } from "@/src/application/ports/whatsapp";

/** Fila reclamada de `whatsapp_outbox`, lista para mandar. */
export interface OutboxRow {
  id: string;
  event: string;
  recipient: string;
  templateName: string;
  templateParams: Record<string, string>;
  buttonSuffix: string | null;
  /** Intentos ANTERIORES a este. */
  attempts: number;
}

/** Lo que el worker necesita de la cola; el adaptador vive en whatsapp-outbox-repository. */
export interface WhatsAppOutboxWorkerRepository {
  /** Reclama hasta `limit` filas debidas (SKIP LOCKED + lease); vence lo atrasado. */
  claim(limit: number): Promise<OutboxRow[]>;
  markSent(id: string, providerId: string): Promise<void>;
  markFailed(id: string, f: { error: string; code: number | null; next: Date; terminal: boolean }): Promise<void>;
}

/** Tope de intentos: con el backoff de abajo cubre ~4 h; después la fila queda `failed`. */
export const WA_MAX_ATTEMPTS = 8;
/** Espera antes del intento n+1 (minutos), por intentos ya hechos. */
export const WA_BACKOFF_MINUTES = [1, 2, 5, 15, 30, 60, 120] as const;
/** Tamaño de cada reclamo: chico, para que una corrida que se queda sin tiempo no deje filas tomadas. */
const CLAIM_BATCH = 5;

export interface OutboxSweepResult {
  configured: boolean;
  claimed: number;
  sent: number;
  /** Fallos que quedaron para reintento. */
  retrying: number;
  /** Fallos terminales (no reintentables o sin intentos). */
  failed: number;
}

export function nextAttemptAt(attemptsDone: number, now: Date): Date {
  const i = Math.min(Math.max(attemptsDone - 1, 0), WA_BACKOFF_MINUTES.length - 1);
  return new Date(now.getTime() + WA_BACKOFF_MINUTES[i] * 60_000);
}

/**
 * Drena `whatsapp_outbox` (pg_cron cada minuto → /api/cron/whatsapp-outbox). En serie: respeta los
 * 100 req/min de Kapso y los 5 msg/s de la coexistencia sin contar nada. Reclama de a poco y para
 * cuando se acaba el presupuesto (pg_net espera 15 s), así nunca deja filas tomadas 5 minutos.
 */
export class WhatsAppOutboxService {
  constructor(
    private readonly repo: WhatsAppOutboxWorkerRepository,
    private readonly sender: WhatsAppSender,
    private readonly configured: boolean,
  ) {}

  async sweep(opts: { limit?: number; budgetMs?: number; now?: () => Date } = {}): Promise<OutboxSweepResult> {
    const result: OutboxSweepResult = { configured: this.configured, claimed: 0, sent: 0, retrying: 0, failed: 0 };
    // Sin credenciales no se reclama nada: las filas (si las hubiera) esperan intactas.
    if (!this.configured) return result;
    const limit = opts.limit ?? 25;
    const now = opts.now ?? (() => new Date());
    const deadline = now().getTime() + (opts.budgetMs ?? 10_000);

    while (result.claimed < limit && now().getTime() < deadline) {
      const rows = await this.repo.claim(Math.min(CLAIM_BATCH, limit - result.claimed));
      if (rows.length === 0) break;
      result.claimed += rows.length;
      for (const row of rows) await this.sendOne(row, now, result);
    }
    return result;
  }

  private async sendOne(row: OutboxRow, now: () => Date, result: OutboxSweepResult): Promise<void> {
    try {
      const { providerId } = await this.sender.sendTemplate(row.recipient, {
        name: row.templateName,
        language: "es",
        params: row.templateParams,
        ...(row.buttonSuffix ? { buttonSuffix: row.buttonSuffix } : {}),
      });
      await this.repo.markSent(row.id, providerId);
      result.sent++;
    } catch (e) {
      const err = e instanceof WhatsAppSendError ? e : null;
      const attemptsDone = row.attempts + 1;
      // Un error que no es del proveedor (DB, bug) se reintenta: no hay razón para darlo por perdido.
      const terminal = (err ? !err.retryable : false) || attemptsDone >= WA_MAX_ATTEMPTS;
      const message = e instanceof Error ? e.message : String(e);
      console.error("[whatsapp-outbox:send]", row.id, row.event, message);
      await this.repo
        .markFailed(row.id, { error: message, code: err?.code ?? null, next: nextAttemptAt(attemptsDone, now()), terminal })
        .catch((e2) => console.error("[whatsapp-outbox:mark-failed]", row.id, e2));
      if (terminal) result.failed++;
      else result.retrying++;
    }
  }
}
