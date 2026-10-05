import type { SupabaseClient } from "@supabase/supabase-js";
import { DOOR_ACCESS_KINDS } from "@/src/domain/scheduling/reservation-kind";
import type { ReminderRepository } from "@/src/application/reminders/reminder-service";
import type { Database } from "./database.types";

/** Ventana del recordatorio: empieza en (ahora+2 h, ahora+24 h]; reservada hace ≥ 12 h. */
export const REMINDER_WINDOW = { minHoursAhead: 2, maxHoursAhead: 24, minAgeHours: 12 } as const;

export class SupabaseReminderRepository implements ReminderRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async remindersDue(now: Date = new Date()) {
    const h = 3600_000;
    const { data, error } = await this.db
      .from("reservations")
      .select("id, order_id, starts_at, ends_at, customer_name, customer_email, course_sessions(n, title, instructor)")
      .in("kind", [...DOOR_ACCESS_KINDS])
      .eq("status", "confirmed")
      .is("reminder_sent_at", null)
      .gt("starts_at", new Date(now.getTime() + REMINDER_WINDOW.minHoursAhead * h).toISOString())
      .lte("starts_at", new Date(now.getTime() + REMINDER_WINDOW.maxHoursAhead * h).toISOString())
      .lte("created_at", new Date(now.getTime() - REMINDER_WINDOW.minAgeHours * h).toISOString())
      .order("starts_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      orderId: r.order_id,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      course: sessionOf(r.course_sessions),
    }));
  }

  /** Reclama solo si aún no estaba marcado: dos corridas del cron no mandan dos veces. */
  async markReminderSent(reservationId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("reservations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", reservationId)
      .is("reminder_sent_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseReminderSent(reservationId: string): Promise<void> {
    const { error } = await this.db.from("reservations").update({ reminder_sent_at: null }).eq("id", reservationId);
    if (error) throw new Error(error.message);
  }
}

/** Uno-a-uno (course_sessions.reservation_id es único); PostgREST puede devolver arreglo. */
function sessionOf(
  s: { n: number; title: string; instructor: string | null } | { n: number; title: string; instructor: string | null }[] | null,
): { n: number; title: string; instructor: string | null } | null {
  const one = Array.isArray(s) ? s[0] : s;
  return one ? { n: one.n, title: one.title, instructor: one.instructor } : null;
}
