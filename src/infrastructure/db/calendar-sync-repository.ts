import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CalendarSyncRepository,
  ClaimedSyncRow,
  SyncFailure,
  SyncStats,
} from "@/src/application/ports/calendar";
import type { ReservationKind, ReservationSnapshot, ReservationStatus } from "@/src/domain/calendar/google-event";
import type { Database } from "./database.types";

/**
 * Cola `calendar_sync` (migración 20261001120000). Las escrituras que dependen de la versión
 * reclamada van por RPC: PostgREST no puede expresar "pending = version cambió".
 */
export class SupabaseCalendarSyncRepository implements CalendarSyncRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async claimDue(limit: number): Promise<ClaimedSyncRow[]> {
    const { data, error } = await this.db.rpc("calendar_sync_claim", { p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      reservationId: r.reservation_id,
      version: Number(r.version),
      attempts: r.attempts,
      lastFingerprint: r.last_fingerprint,
    }));
  }

  async snapshot(reservationId: string): Promise<ReservationSnapshot | null> {
    const { data, error } = await this.db.rpc("calendar_sync_snapshot", { p_reservation: reservationId });
    if (error) throw new Error(error.message);
    const r = data?.[0];
    if (!r) return null;
    return {
      id: r.id,
      kind: r.kind as ReservationKind,
      status: r.status as ReservationStatus,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      expiresAt: r.expires_at,
      customerName: r.customer_name,
      notes: r.notes,
      orderId: r.order_id,
      rescheduleId: r.reschedule_id,
      course:
        r.course_n != null
          ? { n: r.course_n, title: r.course_title ?? "", sessionStatus: r.course_session_status ?? "", generationName: r.generation_name ?? "" }
          : null,
      addons: r.addons ?? [],
      tz: r.tz,
    };
  }

  async markSynced(
    reservationId: string,
    version: number,
    result: { googleEventId: string | null; fingerprint: string | null; gone: boolean },
  ): Promise<void> {
    const { error } = await this.db.rpc("calendar_sync_mark_synced", {
      p_reservation: reservationId,
      p_version: version,
      // Los args text de una RPC se tipan como string; null es válido en SQL.
      p_event_id: result.googleEventId as string,
      p_fingerprint: result.fingerprint as string,
      p_gone: result.gone,
    });
    if (error) throw new Error(error.message);
  }

  async markFailed(reservationId: string, version: number, message: string, nextAttemptAt: Date): Promise<void> {
    const { error } = await this.db.rpc("calendar_sync_mark_failed", {
      p_reservation: reservationId,
      p_version: version,
      p_error: message,
      p_next: nextAttemptAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async release(reservationId: string): Promise<void> {
    const { error } = await this.db.from("calendar_sync").update({ locked_at: null }).eq("reservation_id", reservationId);
    if (error) throw new Error(error.message);
  }

  async enqueueAll(): Promise<number> {
    const { data, error } = await this.db.rpc("calendar_sync_enqueue_all");
    if (error) throw new Error(error.message);
    return data ?? 0;
  }

  async forceDue(): Promise<number> {
    const { data, error } = await this.db
      .from("calendar_sync")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("pending", true)
      .select("reservation_id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async stats(): Promise<SyncStats> {
    const [pending, failing, last] = await Promise.all([
      this.db.from("calendar_sync").select("reservation_id", { count: "exact", head: true }).eq("pending", true),
      this.db.from("calendar_sync").select("reservation_id", { count: "exact", head: true }).eq("pending", true).not("last_error", "is", null),
      this.db.from("calendar_sync").select("last_synced_at").not("last_synced_at", "is", null).order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const r of [pending, failing, last]) if (r.error) throw new Error(r.error.message);
    return { pending: pending.count ?? 0, failing: failing.count ?? 0, lastSyncedAt: last.data?.last_synced_at ?? null };
  }

  async failures(limit: number): Promise<SyncFailure[]> {
    const { data, error } = await this.db
      .from("calendar_sync")
      .select("reservation_id, attempts, next_attempt_at, last_error, op")
      .eq("pending", true)
      .not("last_error", "is", null)
      .order("next_attempt_at")
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      reservationId: r.reservation_id,
      attempts: r.attempts,
      nextAttemptAt: r.next_attempt_at,
      lastError: r.last_error ?? "",
      op: r.op === "delete" ? "delete" : "upsert",
    }));
  }
}
