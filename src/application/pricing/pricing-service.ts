import type { RatePlanRepository } from "@/src/application/ports/pricing";
import { quote as quoteEngine } from "@/src/domain/pricing/engine";
import type { Quote } from "@/src/domain/pricing/types";
import { rangeFor, weekdayFor } from "@/src/domain/scheduling/time";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface BookingQuoteInput {
  resourceId: string;
  date: string; // YYYY-MM-DD (local de la locación)
  startMinute: number;
  durationHours: number;
  addonKeys?: string[];
}

export interface BookingQuote {
  quote: Quote;
  currency: string;
  startsAt: string; // ISO UTC
  endsAt: string;
}

/** Cotiza una reserva: carga el price book activo y corre el motor puro. */
export class PricingService {
  constructor(private readonly repo: RatePlanRepository) {}

  async quoteBooking(input: BookingQuoteInput): Promise<Result<BookingQuote, string>> {
    const pricing = await this.repo.getResourcePricing(input.resourceId);
    if (!pricing) return err("recurso sin tarifa activa");

    const weekday = weekdayFor(input.date, pricing.timezone);
    const q = quoteEngine(pricing.ratePlan, {
      weekday,
      startMinute: input.startMinute,
      durationHours: input.durationHours,
      addonKeys: input.addonKeys,
    });
    if (!q.ok) return err(q.error);

    const { startsAt, endsAt } = rangeFor(
      input.date,
      input.startMinute,
      input.durationHours,
      pricing.timezone,
    );
    return ok({ quote: q.value, currency: pricing.ratePlan.currency, startsAt, endsAt });
  }
}
