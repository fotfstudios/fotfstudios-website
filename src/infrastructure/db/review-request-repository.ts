import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewCandidate, ReviewRequestRepository } from "@/src/application/reminders/review-request-service";
import { REVIEW_AFTER_HOURS, REVIEW_WINDOW_DAYS } from "@/src/application/reminders/review-request-service";
import type { Database } from "./database.types";

/**
 * Adaptador del motor de reseñas. La elegibilidad (ventana + "última sesión del curso")
 * vive en la función SQL `reviews_due`; el candado por-cliente se reclama acá con el mismo
 * UPDATE … IS NULL RETURNING que usa el recordatorio de sesión. El reloj es el de la DB
 * (la función usa now()), así que el `now` del barrido no se reenvía.
 */
export class SupabaseReviewRequestRepository implements ReviewRequestRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async reviewsDue(): Promise<ReviewCandidate[]> {
    const { data, error } = await this.db.rpc("reviews_due", {
      p_after_hours: REVIEW_AFTER_HOURS,
      p_window_days: REVIEW_WINDOW_DAYS,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      reservationId: r.reservation_id,
      customerId: r.customer_id,
      email: r.email,
      name: r.name,
      visit: r.kind === "prueba" ? "prueba" : r.kind === "curso" ? "curso" : "sala",
    }));
  }

  /** Reclama solo si aún no se le pidió: dos corridas o dos reservas no mandan dos veces. */
  async claimReviewRequested(customerId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("customers")
      .update({ review_requested_at: new Date().toISOString() })
      .eq("id", customerId)
      .is("review_requested_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseReviewRequested(customerId: string): Promise<void> {
    const { error } = await this.db.from("customers").update({ review_requested_at: null }).eq("id", customerId);
    if (error) throw new Error(error.message);
  }
}
