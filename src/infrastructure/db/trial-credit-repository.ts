import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TrialCreditCandidate,
  TrialCreditNotice,
  TrialCreditRepository,
} from "@/src/application/reminders/trial-followup-service";
import type { Database } from "./database.types";

const COLUMN: Record<TrialCreditNotice, "followup_sent_at" | "expiry_reminder_sent_at"> = {
  followup: "followup_sent_at",
  expiring: "expiry_reminder_sent_at",
};

/** El update tipado de cada aviso (una clave computada pierde el tipo del generador). */
const stamp = (notice: TrialCreditNotice, at: string | null) =>
  notice === "followup" ? { followup_sent_at: at } : { expiry_reminder_sent_at: at };

type Row = {
  id: string;
  email: string;
  amount_clp: number;
  expires_at: string;
  followup_sent_at: string | null;
  expiry_reminder_sent_at: string | null;
  reservations: { ends_at: string; customer_name: string | null } | null;
};

export class SupabaseTrialCreditRepository implements TrialCreditRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Vivos y con algún aviso pendiente. Pocas filas (una por prueba de la última semana):
   * la regla fina de cuándo toca cada aviso vive en `noticeDue`, que es pura y testeada.
   */
  async liveCandidates(): Promise<TrialCreditCandidate[]> {
    const { data, error } = await this.db
      .from("course_credits")
      .select(
        "id, email, amount_clp, expires_at, followup_sent_at, expiry_reminder_sent_at, reservations!course_credits_source_reservation_id_fkey(ends_at, customer_name)",
      )
      .is("consumed_order_id", null)
      .is("voided_at", null)
      .gt("expires_at", new Date().toISOString())
      .or("followup_sent_at.is.null,expiry_reminder_sent_at.is.null");
    if (error) throw new Error(error.message);
    return ((data as unknown as Row[]) ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.reservations?.customer_name ?? null,
      amount: r.amount_clp,
      expiresAt: r.expires_at,
      sessionEndsAt: r.reservations?.ends_at ?? null,
      followupSentAt: r.followup_sent_at,
      expiryReminderSentAt: r.expiry_reminder_sent_at,
    }));
  }

  async claim(creditId: string, notice: TrialCreditNotice): Promise<boolean> {
    const col = COLUMN[notice];
    const { data, error } = await this.db
      .from("course_credits")
      .update(stamp(notice, new Date().toISOString()))
      .eq("id", creditId)
      .is(col, null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async release(creditId: string, notice: TrialCreditNotice): Promise<void> {
    const { error } = await this.db
      .from("course_credits")
      .update(stamp(notice, null))
      .eq("id", creditId);
    if (error) throw new Error(error.message);
  }
}
