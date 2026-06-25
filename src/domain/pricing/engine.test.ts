import { describe, expect, it } from "vitest";
import { quote, rateForSlot, volumePctFor } from "./engine";
import type { Quote, RatePlan } from "./types";

// Fixture = espejo del seed (supabase/migrations foundations). Tarifas legacy.
const plan: RatePlan = {
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
  volumeDiscounts: [
    { minHours: 2, pct: 0.1 },
    { minHours: 3, pct: 0.15 },
    { minHours: 4, pct: 0.2 },
  ],
  addons: [
    { key: "audio", name: "Grabación de audio", amount: 9990 },
    { key: "audioVideo", name: "Grabación audio + video", amount: 49990 },
  ],
};

const val = (r: ReturnType<typeof quote>): Quote => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("rateForSlot", () => {
  it("elige la franja correcta", () => {
    expect(rateForSlot(plan, 1, 600)?.key).toBe("valle"); // Lun mañana
    expect(rateForSlot(plan, 1, 1100)?.key).toBe("puntaSemana"); // Lun tarde
    expect(rateForSlot(plan, 5, 1100)?.key).toBe("puntaFinde"); // Vie tarde
    expect(rateForSlot(plan, 6, 600)?.key).toBe("puntaFinde"); // Sáb
    expect(rateForSlot(plan, 0, 1200)?.key).toBe("puntaFinde"); // Dom
  });

  it("devuelve null fuera de toda franja", () => {
    expect(rateForSlot(plan, 1, 1500)).toBeNull();
  });
});

describe("volumePctFor", () => {
  it("aplica el mayor umbral alcanzado", () => {
    expect(volumePctFor(plan, 1)).toBe(0);
    expect(volumePctFor(plan, 2)).toBe(0.1);
    expect(volumePctFor(plan, 3)).toBe(0.15);
    expect(volumePctFor(plan, 5)).toBe(0.2);
  });
});

describe("quote (paridad con legacy)", () => {
  it("1h valle", () => {
    const q = val(quote(plan, { weekday: 1, startMinute: 600, durationHours: 1 }));
    expect(q.total).toBe(9990);
    expect(q.volumePct).toBe(0);
    expect(q.net).toBe(8395);
    expect(q.tax).toBe(1595);
    expect(q.net + q.tax).toBe(q.total);
    expect(q.tierLines).toEqual([{ key: "valle", hours: 1, rate: 9990, subtotal: 9990 }]);
  });

  it("2h cruzando valle→punta semana (Lun), -10%", () => {
    const q = val(quote(plan, { weekday: 1, startMinute: 960, durationHours: 2 }));
    expect(q.roomSubtotal).toBe(24980);
    expect(q.volumePct).toBe(0.1);
    expect(q.discount).toBe(2498);
    expect(q.total).toBe(22480);
  });

  it("2h cruzando valle→punta finde (Vie), -10%", () => {
    const q = val(quote(plan, { weekday: 5, startMinute: 960, durationHours: 2 }));
    expect(q.total).toBe(26980);
  });

  it("3h fin de semana (Sáb), -15%", () => {
    const q = val(quote(plan, { weekday: 6, startMinute: 720, durationHours: 3 }));
    expect(q.roomSubtotal).toBe(59970);
    expect(q.volumePct).toBe(0.15);
    expect(q.total).toBe(50970);
  });

  it("4h valle + add-on audio (descuento solo a la sala)", () => {
    const q = val(quote(plan, { weekday: 1, startMinute: 600, durationHours: 4, addonKeys: ["audio"] }));
    expect(q.roomSubtotal).toBe(39960);
    expect(q.volumePct).toBe(0.2);
    expect(q.addonsTotal).toBe(9990);
    expect(q.total).toBe(41960);
  });

  it("add-on audio+video", () => {
    const q = val(quote(plan, { weekday: 1, startMinute: 600, durationHours: 1, addonKeys: ["audioVideo"] }));
    expect(q.addonsTotal).toBe(49990);
    expect(q.total).toBe(59980);
  });

  it("rechaza duración inválida", () => {
    expect(quote(plan, { weekday: 1, startMinute: 600, durationHours: 0 }).ok).toBe(false);
  });

  it("rechaza add-on desconocido", () => {
    expect(quote(plan, { weekday: 1, startMinute: 600, durationHours: 1, addonKeys: ["xyz"] }).ok).toBe(false);
  });
});
