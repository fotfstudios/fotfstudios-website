import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimiter } from "@/src/application/ports/rate-limit";
import type { Database } from "./database.types";

export class SupabaseRateLimiter implements RateLimiter {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async hit(key: string, max: number, windowSeconds: number): Promise<boolean> {
    const { data, error } = await this.db.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
