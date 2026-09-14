import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationFailure,
  NotificationLogEntry,
  NotificationLogRepository,
} from "@/src/application/ports/notification-log";
import type { Database } from "./database.types";

export class SupabaseNotificationLogRepository implements NotificationLogRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async record(entry: NotificationLogEntry): Promise<void> {
    const { error } = await this.db.rpc("notification_log_record", {
      p_template: entry.template,
      p_recipient: entry.recipient,
      p_subject: entry.subject,
      p_ok: entry.ok,
      p_error: entry.error ?? "",
    });
    if (error) throw new Error(error.message);
  }

  async recentFailures(hours: number, limit = 20): Promise<NotificationFailure[]> {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data, error } = await this.db
      .from("notification_log")
      .select("id, created_at, template, recipient, subject, ok, error")
      .eq("ok", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      template: r.template,
      recipient: r.recipient,
      subject: r.subject,
      ok: r.ok,
      error: r.error,
    }));
  }
}
