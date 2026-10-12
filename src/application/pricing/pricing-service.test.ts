import { describe, expect, it } from "vitest";
import type { RatePlan } from "@/src/domain/pricing/types";
import { PricingService } from "./pricing-service";

// Espejo del seed (foundations): valle Lun–Vie hasta 17:00, punta finde Vie 17:00+ y Sáb/Dom.
const ratePlan: RatePlan = {
  currency: "CLP",
  taxMode: "inclusive",
  taxPct: 0.19,
  roundingIncrement: 10,
  minHours: 1,
  tiers: [
    { key: "valle", weekdays: [1, 2, 3, 4, 5], startMinute: 540, endMinute: 1020, amount: 9990, priority: 0 },
    { key: "puntaSemana", weekdays: [1, 2, 3, 4], startMinute: 1020, endMinute: 1440, amount: 14990, priority: 1 },
    { key: "puntaFinde", weekdays: [5], startMinute: 1020, endMinute: 1440, amount: 19990, priority: 1 },
    { key: "puntaFinde", weekdays: [0, 6], startMinute: 0, endMinute: 1440, amount: 19990, priority: 1 },
  ],
  volumeDiscounts: [],
  addons: [],
};

const service = new PricingService({
  getResourcePricing: async (resourceId) => ({ resourceId, timezone: "America/Santiago", ratePlan }),
});

const quoteAt = async (date: string, startMinute: number) => {
  const r = await service.quoteBooking({ resourceId: "sala", date, startMinute, durationHours: 1 });
  if (!r.ok) throw new Error(r.error);
  return r.value.quote;
};

describe("PricingService.quoteBooking — feriados", () => {
  it("un feriado en lunes se cobra punta finde, también en horario valle", async () => {
    const q = await quoteAt("2026-10-12", 600); // Encuentro de Dos Mundos, 10:00
    expect(q.tierLines).toEqual([{ key: "puntaFinde", hours: 1, rate: 19990, subtotal: 19990 }]);
  });

  it("un viernes feriado es punta finde desde la apertura", async () => {
    const q = await quoteAt("2026-12-25", 600); // Navidad, 10:00
    expect(q.tierLines[0].key).toBe("puntaFinde");
  });

  it("un lunes normal sigue en valle", async () => {
    const q = await quoteAt("2026-10-19", 600);
    expect(q.tierLines[0].key).toBe("valle");
  });

  it("el rango UTC usa la fecha real, no la de un domingo", async () => {
    const r = await service.quoteBooking({ resourceId: "sala", date: "2026-10-12", startMinute: 600, durationHours: 1 });
    expect(r.ok && r.value.startsAt).toBe("2026-10-12T13:00:00.000Z");
  });
});
