import { describe, expect, it, vi } from "vitest";
import type { CheckoutRepository } from "@/src/application/ports/checkout";
import type { BookingQuote, PricingService } from "@/src/application/pricing/pricing-service";
import type { Quote } from "@/src/domain/pricing/types";
import { ok } from "@/src/domain/shared/result";
import { CheckoutService } from "./checkout-service";

const EMPTY_QUOTE = {
  tierLines: [],
  addonLines: [],
  addonsTotal: 0,
  total: 0,
  net: 0,
  tax: 0,
  volumePct: 0,
} as unknown as Quote;

function fakePricing(startsAt: string, endsAt: string): PricingService {
  const value: BookingQuote = { quote: EMPTY_QUOTE, currency: "CLP", startsAt, endsAt };
  return { quoteBooking: vi.fn().mockResolvedValue(ok(value)) } as unknown as PricingService;
}

const input = {
  resourceId: "res",
  date: "2026-06-29",
  startMinute: 540,
  durationHours: 1,
  customer: { email: "a@b.cl" },
};

describe("CheckoutService.createBooking — anticipación mínima", () => {
  it("rechaza un inicio en el pasado sin crear el checkout", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn() };
    const svc = new CheckoutService(fakePricing("2020-01-01T12:00:00.000Z", "2020-01-01T13:00:00.000Z"), repo);

    const r = await svc.createBooking(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_soon");
    expect(repo.createCheckout).not.toHaveBeenCalled();
  });

  it("rechaza un inicio dentro de la anticipación mínima", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn() };
    const soon = new Date(Date.now() + 10 * 60_000).toISOString(); // 10 min < 30 min de lead
    const svc = new CheckoutService(fakePricing(soon, soon), repo);

    const r = await svc.createBooking(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_soon");
    expect(repo.createCheckout).not.toHaveBeenCalled();
  });

  it("permite un inicio con suficiente anticipación", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(fakePricing("2999-01-01T12:00:00.000Z", "2999-01-01T13:00:00.000Z"), repo);

    const r = await svc.createBooking(input);

    expect(r.ok).toBe(true);
    expect(repo.createCheckout).toHaveBeenCalledOnce();
  });
});
