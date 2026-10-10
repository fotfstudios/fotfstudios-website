import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeatcoinsCampaignRepository, CampaignCandidate } from "@/src/application/points/beatcoins-campaign-service";
import type { Database } from "./database.types";

const COLS =
  "id, email, name, points_balance, points_protected, points_activity_at, email_unsubscribe_token, points_digest_sent_at";

type Row = {
  id: string;
  email: string | null;
  name: string | null;
  points_balance: number;
  points_protected: number;
  points_activity_at: string | null;
  email_unsubscribe_token: string;
  points_digest_sent_at: string | null;
};

const toCandidate = (r: Row): CampaignCandidate => ({
  customerId: r.id,
  email: r.email!,
  name: r.name,
  balance: r.points_balance,
  protected: r.points_protected,
  activityAt: r.points_activity_at,
  unsubscribeToken: r.email_unsubscribe_token,
  digestSentAt: r.points_digest_sent_at,
});

export class SupabaseBeatcoinsCampaignRepository implements BeatcoinsCampaignRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async launchAudience(): Promise<number> {
    const { count, error } = await this.db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gt("points_balance", 0)
      .not("email", "is", null)
      .neq("email", "")
      .is("points_launch_queued_at", null)
      .is("points_launch_sent_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async queueLaunch(): Promise<number> {
    const { data, error } = await this.db
      .from("customers")
      .update({ points_launch_queued_at: new Date().toISOString() })
      .gt("points_balance", 0)
      .not("email", "is", null)
      .neq("email", "")
      .is("points_launch_queued_at", null)
      .is("points_launch_sent_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async launchStatus(): Promise<{ queued: number; sent: number }> {
    const count = async (sent: boolean) => {
      const q = this.db.from("customers").select("id", { count: "exact", head: true }).not("points_launch_queued_at", "is", null);
      const { count: n, error } = await (sent ? q.not("points_launch_sent_at", "is", null) : q.is("points_launch_sent_at", null));
      if (error) throw new Error(error.message);
      return n ?? 0;
    };
    const [queued, sent] = await Promise.all([count(false), count(true)]);
    return { queued, sent };
  }

  async launchPending(limit: number): Promise<CampaignCandidate[]> {
    if (limit <= 0) return [];
    const { data, error } = await this.db
      .from("customers")
      .select(COLS)
      .not("points_launch_queued_at", "is", null)
      .is("points_launch_sent_at", null)
      .not("email", "is", null)
      .neq("email", "")
      .order("points_launch_queued_at")
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCandidate);
  }

  async digestPending(monthStart: string, launchSince: string, limit: number): Promise<CampaignCandidate[]> {
    if (limit <= 0) return [];
    const { data, error } = await this.db
      .from("customers")
      .select(COLS)
      .gt("points_balance", 0)
      .not("email", "is", null)
      .neq("email", "")
      .is("email_digest_opt_out_at", null)
      .or(`points_digest_sent_at.is.null,points_digest_sent_at.lt.${monthStart}`)
      .or(`points_launch_sent_at.is.null,points_launch_sent_at.lt.${launchSince}`)
      .order("id")
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toCandidate);
  }

  async claimLaunch(customerId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("customers")
      .update({ points_launch_sent_at: new Date().toISOString() })
      .eq("id", customerId)
      .is("points_launch_sent_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseLaunch(customerId: string): Promise<void> {
    const { error } = await this.db.from("customers").update({ points_launch_sent_at: null }).eq("id", customerId);
    if (error) throw new Error(error.message);
  }

  async claimDigest(customerId: string, monthStart: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("customers")
      .update({ points_digest_sent_at: new Date().toISOString() })
      .eq("id", customerId)
      .is("email_digest_opt_out_at", null)
      .or(`points_digest_sent_at.is.null,points_digest_sent_at.lt.${monthStart}`)
      .select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async releaseDigest(customerId: string, previous: string | null): Promise<void> {
    const { error } = await this.db.from("customers").update({ points_digest_sent_at: previous }).eq("id", customerId);
    if (error) throw new Error(error.message);
  }

  async unsubscribeDigest(token: string): Promise<boolean> {
    // Idempotente: una segunda baja deja la fecha de la primera.
    const { data, error } = await this.db
      .from("customers")
      .select("id, email_digest_opt_out_at")
      .eq("email_unsubscribe_token", token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return false;
    if (!data.email_digest_opt_out_at) {
      const { error: e2 } = await this.db
        .from("customers")
        .update({ email_digest_opt_out_at: new Date().toISOString() })
        .eq("id", data.id);
      if (e2) throw new Error(e2.message);
    }
    return true;
  }

  /** Casilla de /cuenta/perfil: true = quiere el resumen. */
  async setDigest(customerId: string, wants: boolean): Promise<void> {
    const { error } = await this.db
      .from("customers")
      .update({ email_digest_opt_out_at: wants ? null : new Date().toISOString() })
      .eq("id", customerId);
    if (error) throw new Error(error.message);
  }
}
