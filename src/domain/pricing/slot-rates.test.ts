import { describe, expect, it } from "vitest";
import { hourlyRates, peakLegend } from "./slot-rates";
import type { RateTier } from "./types";

const WEEK = [1, 2, 3, 4, 5];
const TIERS: RateTier[] = [
  { key: "valle", weekdays: WEEK, startMinute: 540, endMinute: 1020, amount: 8000, priority: 0 },
  { key: "puntaSemana", weekdays: [1, 2, 3, 4], startMinute: 1020, endMinute: 1440, amount: 12000, priority: 0 },
  { key: "puntaFinde", weekdays: [5], startMinute: 1020, endMinute: 1440, amount: 14000, priority: 0 },
  { key: "puntaFinde", weekdays: [0, 6], startMinute: 0, endMinute: 1440, amount: 14000, priority: 0 },
];

describe("hourlyRates", () => {
  it("tarifa por hora de apertura, marcando punta lo que supera la tarifa más baja", () => {
    expect(hourlyRates(TIERS, 2, 960, 1140)).toEqual([
      { minute: 960, amount: 8000, tierKey: "valle", peak: false },
      { minute: 1020, amount: 12000, tierKey: "puntaSemana", peak: true },
      { minute: 1080, amount: 12000, tierKey: "puntaSemana", peak: true },
    ]);
  });

  it("hora sin tramo → amount null", () => {
    expect(hourlyRates(TIERS, 2, 480, 540)).toEqual([{ minute: 480, amount: null, tierKey: null, peak: false }]);
  });
});

describe("peakLegend", () => {
  it("punta desde la primera hora cara del día", () => {
    expect(peakLegend(TIERS, 2, 540, 1380)).toBe("Tarifa nocturna desde 17:00");
    expect(peakLegend(TIERS, 5, 540, 1380)).toBe("Tarifa fin de semana desde 17:00");
  });

  it("todo el día cuando no hay hora valle; null sin punta", () => {
    expect(peakLegend(TIERS, 6, 600, 1380)).toBe("Tarifa fin de semana · todo el día");
    expect(peakLegend(TIERS, 2, 540, 1020)).toBeNull();
  });
});
