import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BeatcoinsDueCandidate,
  BeatcoinsExpiredCandidate,
  BeatcoinsExpiryRepository,
  BeatcoinsNotice,
} from "@/src/application/points/beatcoins-expiry-service";
import type { Database } from "./database.types";

const COLUMN = {
  expired: "points_expired_notice_at",
  n7: "points_expiry_notice_7_at",
  n30: "points_expiry_notice_30_at",
} as const satisfies Record<BeatcoinsNotice, string>;

/** El update tipado de cada aviso (una clave computada pierde el tipo del generador). */
const stamp = (notice: BeatcoinsNotice, at: string | null) =>
  notice === "expired"
    ? { points_expired_notice_at: at }
    : notice === "n7"
      ? { points_expiry_notice_7_at: at }
      : { points_expiry_notice_30_at: at };

export class SupabaseBeatcoinsExpiryRepository implements BeatcoinsExpiryRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async expire(): Promise<number> {
    const { data, error } = await this.db.rpc("expire_beatcoins");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async expiredPending(): Promise<BeatcoinsExpiredCandidate[]> {
    const { data, error } = await this.db
      .from("customers")
      .select("id, email, name, points_balance, points_last_expired_amount")
      .not("points_last_expired_at", "is", null)
      .is("points_expired_notice_at", null)
      .not("email", "is", null)
      .neq("email", "");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      customerId: r.id,
      email: r.email!,
      name: r.name,
      expired: r.points_last_expired_amount ?? 0,
      remaining: Math.max(r.points_balance, 0),
    }));
  }

  async due(days: 7 | 30): Promise<BeatcoinsDueCandidate[]> {
    const { data, error } = await this.db.rpc("beatcoins_expiry_due", { p_days: days });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      customerId: r.customer_id,
      email: r.email,
      name: r.name,
      expirable: r.expirable,
      protected: r.protected,
      expiresAt: r.expires_at,
    }));
  }

  async claim(customerId: string, notice: BeatcoinsNotice): Promise<boolean> {
    const { data, error } = await this.db
      .from("customers")
      .update(stamp(notice, new Date().toISOString()))
      .eq("id", customerId)
      .is(COLUMN[notice], null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async release(customerId: string, notice: BeatcoinsNotice): Promise<void> {
    const { error } = await this.db.from("customers").update(stamp(notice, null)).eq("id", customerId);
    if (error) throw new Error(error.message);
  }
}
