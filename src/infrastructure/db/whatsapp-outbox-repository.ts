import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppOutbox, WhatsAppOutboxEntry } from "@/src/application/ports/whatsapp";
import type { OutboxRow, WhatsAppOutboxWorkerRepository } from "@/src/application/whatsapp/outbox-service";
import type { Database } from "./database.types";

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface WhatsAppOutboxStats {
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  expired: number;
}

export interface WhatsAppOutboxFailure {
  id: string;
  event: string;
  recipient: string;
  templateName: string;
  attempts: number;
  failedCode: number | null;
  lastError: string | null;
  createdAt: string;
  expiresAt: string;
}

/** Cola de WhatsApp (migración 20261003120000). Solo service_role. */
export class SupabaseWhatsAppOutboxRepository implements WhatsAppOutbox, WhatsAppOutboxWorkerRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async enqueue(e: WhatsAppOutboxEntry): Promise<void> {
    // ignoreDuplicates: la misma dedupe_key (el mismo aviso para la misma entidad) no es error.
    const { error } = await this.db.from("whatsapp_outbox").upsert(
      {
        dedupe_key: e.dedupeKey,
        event: e.event,
        recipient: e.to,
        template_name: e.template.name,
        template_params: e.template.params,
        button_suffix: e.template.buttonSuffix ?? null,
        entity_kind: e.entity?.kind ?? null,
        entity_id: e.entity?.id ?? null,
        expires_at: e.expiresAt,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }

  async claim(limit: number): Promise<OutboxRow[]> {
    const { data, error } = await this.db.rpc("whatsapp_outbox_claim", { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      event: r.event,
      recipient: r.recipient,
      templateName: r.template_name,
      templateParams: (r.template_params ?? {}) as Record<string, string>,
      buttonSuffix: r.button_suffix,
      attempts: r.attempts,
    }));
  }

  async markSent(id: string, providerId: string): Promise<void> {
    const { error } = await this.db.rpc("whatsapp_outbox_mark_sent", { p_id: id, p_provider_id: providerId });
    if (error) throw new Error(error.message);
  }

  async markFailed(id: string, f: { error: string; code: number | null; next: Date; terminal: boolean }): Promise<void> {
    const { error } = await this.db.rpc("whatsapp_outbox_mark_failed", {
      p_id: id,
      p_error: f.error,
      // El generador tipa los int params como `number`; la función acepta NULL.
      p_code: f.code as unknown as number,
      p_next: f.next.toISOString(),
      p_terminal: f.terminal,
    });
    if (error) throw new Error(error.message);
  }

  /** Estado desde el webhook de Kapso. false = el wamid no es nuestro o el estado no avanza. */
  async applyStatus(providerId: string, status: WhatsAppDeliveryStatus, code: number | null, message: string | null): Promise<boolean> {
    const { data, error } = await this.db.rpc("whatsapp_outbox_apply_status", {
      p_provider_id: providerId,
      p_status: status,
      p_code: code as unknown as number,
      p_message: message as unknown as string,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  /** true = primera vez que vemos esta entrega del webhook (X-Idempotency-Key). */
  async claimWebhook(idempotencyKey: string, event: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("whatsapp_webhook_claim", { p_key: idempotencyKey, p_event: event });
    if (error) throw new Error(error.message);
    return data === true;
  }

  async stats(hours = 24): Promise<WhatsAppOutboxStats> {
    const { data, error } = await this.db.rpc("whatsapp_outbox_stats", { p_hours: hours });
    if (error) throw new Error(error.message);
    const r = data?.[0];
    return {
      pending: Number(r?.pending ?? 0),
      sent: Number(r?.sent ?? 0),
      delivered: Number(r?.delivered ?? 0),
      failed: Number(r?.failed ?? 0),
      expired: Number(r?.expired ?? 0),
    };
  }

  async recentFailures(limit = 20): Promise<WhatsAppOutboxFailure[]> {
    const { data, error } = await this.db
      .from("whatsapp_outbox")
      .select("id, event, recipient, template_name, attempts, failed_code, last_error, created_at, expires_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      event: r.event,
      recipient: r.recipient,
      templateName: r.template_name,
      attempts: r.attempts,
      failedCode: r.failed_code,
      lastError: r.last_error,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  }

  async retryFailed(): Promise<number> {
    const { data, error } = await this.db.rpc("whatsapp_outbox_retry_failed");
    if (error) throw new Error(error.message);
    return data ?? 0;
  }
}
