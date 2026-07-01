import type { SupabaseClient } from "@supabase/supabase-js";
import type { RatePlanRepository, ResourcePricing } from "@/src/application/ports/pricing";
import type { RatePlan } from "@/src/domain/pricing/types";
import type { Database } from "./database.types";

/** Carga el price book ACTIVO del recurso desde Supabase y lo mapea a RatePlan. */
export class SupabaseRatePlanRepository implements RatePlanRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getResourcePricing(resourceId: string): Promise<ResourcePricing | null> {
    const { data: resource } = await this.db
      .from("resources")
      .select("id, location_id")
      .eq("id", resourceId)
      .single();
    if (!resource) return null;

    const { data: location } = await this.db
      .from("locations")
      .select("timezone")
      .eq("id", resource.location_id)
      .single();
    const timezone = location?.timezone ?? "America/Santiago";

    const { data: pb } = await this.db
      .from("price_books")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .single();
    if (!pb) return null;

    const { data: plan } = await this.db
      .from("rate_plans")
      .select("id, currency, tax_mode, rounding_increment, min_hours")
      .eq("resource_id", resourceId)
      .eq("price_book_id", pb.id)
      .single();
    if (!plan) return null;

    const [tiers, vols, addons, iva] = await Promise.all([
      this.db.from("rate_tiers").select("*").eq("rate_plan_id", plan.id),
      this.db.from("volume_discounts").select("*").eq("rate_plan_id", plan.id),
      this.db.from("addons").select("*").eq("rate_plan_id", plan.id).eq("active", true),
      this.db.from("tax_rates").select("pct").eq("code", "IVA").single(),
    ]);

    const ratePlan: RatePlan = {
      currency: plan.currency,
      taxMode: plan.tax_mode,
      taxPct: Number(iva.data?.pct ?? 0.19),
      roundingIncrement: plan.rounding_increment,
      minHours: plan.min_hours,
      tiers: (tiers.data ?? []).map((t) => ({
        key: t.key,
        weekdays: t.weekdays,
        startMinute: t.start_minute,
        endMinute: t.end_minute,
        amount: t.amount_clp,
        priority: t.priority,
      })),
      volumeDiscounts: (vols.data ?? []).map((v) => ({ minHours: v.min_hours, pct: Number(v.pct) })),
      addons: (addons.data ?? []).map((a) => ({
        key: a.key,
        name: a.name,
        amount: a.amount_clp,
        kind: a.kind === "per_hour" ? "per_hour" : "flat_service",
      })),
    };

    return { resourceId, timezone, ratePlan };
  }
}
