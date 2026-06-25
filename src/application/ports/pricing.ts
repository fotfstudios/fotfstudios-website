import type { RatePlan } from "@/src/domain/pricing/types";

/** Tarifa + tz resueltas para un recurso (no confiar en tz del cliente). */
export interface ResourcePricing {
  resourceId: string;
  timezone: string;
  ratePlan: RatePlan;
}

export interface RatePlanRepository {
  getResourcePricing(resourceId: string): Promise<ResourcePricing | null>;
}
