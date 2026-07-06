import { describe, expect, it } from "vitest";
import {
  refundPolicy,
  reschedulePolicy,
  resolveRefundAmount,
  suggestedRefund,
} from "./cancellation-policy";

// Reloj fijo: 2026-07-03 12:00 UTC. La política compara instantes (TZ solo es display).
const NOW = new Date("2026-07-03T12:00:00Z");
const startsAt = (hoursAhead: number) =>
  new Date(NOW.getTime() + hoursAhead * 3_600_000).toISOString();

describe("refundPolicy", () => {
  it("≥24 h → 100%", () => {
    expect(refundPolicy(startsAt(25), NOW).pct).toBe(1);
    expect(refundPolicy(startsAt(24), NOW).pct).toBe(1); // borde exacto favorece al cliente
  });

  it("[12 h, 24 h) → 50%", () => {
    expect(refundPolicy(startsAt(23.99), NOW).pct).toBe(0.5);
    expect(refundPolicy(startsAt(12), NOW).pct).toBe(0.5); // borde exacto favorece al cliente
  });

  it("<12 h, iniciada o pasada → 0%", () => {
    expect(refundPolicy(startsAt(11.99), NOW).pct).toBe(0);
    expect(refundPolicy(startsAt(0), NOW).pct).toBe(0);
    expect(refundPolicy(startsAt(-5), NOW).pct).toBe(0);
  });

  it("expone hoursUntil y un label es-CL", () => {
    const tier = refundPolicy(startsAt(30), NOW);
    expect(tier.hoursUntil).toBeCloseTo(30, 5);
    expect(tier.label).toContain("total");
  });
});

describe("reschedulePolicy", () => {
  it("≥12 h → se puede reagendar", () => {
    expect(reschedulePolicy(startsAt(24), NOW).allowed).toBe(true);
    expect(reschedulePolicy(startsAt(12), NOW).allowed).toBe(true); // borde exacto favorece al cliente
  });

  it("<12 h, iniciada o pasada → no se puede reagendar", () => {
    expect(reschedulePolicy(startsAt(11.99), NOW).allowed).toBe(false);
    expect(reschedulePolicy(startsAt(0), NOW).allowed).toBe(false);
    expect(reschedulePolicy(startsAt(-5), NOW).allowed).toBe(false);
  });

  it("comparte el corte de 12 h con el reembolso: bajo 12 h no hay ni reembolso ni reagendamiento", () => {
    expect(refundPolicy(startsAt(11.99), NOW).pct).toBe(0);
    expect(reschedulePolicy(startsAt(11.99), NOW).allowed).toBe(false);
  });

  it("expone hoursUntil y un label es-CL", () => {
    const decision = reschedulePolicy(startsAt(30), NOW);
    expect(decision.hoursUntil).toBeCloseTo(30, 5);
    expect(decision.label).toContain("sin costo");
  });
});

describe("suggestedRefund", () => {
  it("100% devuelve la boleta viva exacta", () => {
    expect(suggestedRefund(refundPolicy(startsAt(48), NOW), 19990)).toBe(19990);
  });
  it("50% redondea a entero CLP", () => {
    expect(suggestedRefund(refundPolicy(startsAt(18), NOW), 19990)).toBe(9995);
    expect(suggestedRefund(refundPolicy(startsAt(18), NOW), 9995)).toBe(4998); // impar → round
  });
  it("0% → 0", () => {
    expect(suggestedRefund(refundPolicy(startsAt(2), NOW), 19990)).toBe(0);
  });
});

describe("resolveRefundAmount", () => {
  const ctx = { startsAt: startsAt(48), liveBoleta: 19990, now: NOW };

  it("none → null (cancelar sin reembolso)", () => {
    expect(resolveRefundAmount("none", ctx)).toBeNull();
  });

  it("full → boleta viva completa", () => {
    expect(resolveRefundAmount("full", ctx)).toBe(19990);
  });

  it("policy → monto sugerido por el tier; tier 0% → null", () => {
    expect(resolveRefundAmount("policy", ctx)).toBe(19990);
    expect(resolveRefundAmount("policy", { ...ctx, startsAt: startsAt(18) })).toBe(9995);
    expect(resolveRefundAmount("policy", { ...ctx, startsAt: startsAt(1) })).toBeNull();
  });

  it("custom válido → el monto; fuera de rango o no entero → error es-CL", () => {
    expect(resolveRefundAmount("custom", { ...ctx, customAmount: 5000 })).toBe(5000);
    expect(resolveRefundAmount("custom", { ...ctx, customAmount: 19990 })).toBe(19990);
    expect(() => resolveRefundAmount("custom", { ...ctx, customAmount: 0 })).toThrow(/entre/);
    expect(() => resolveRefundAmount("custom", { ...ctx, customAmount: 20000 })).toThrow(/entre/);
    expect(() => resolveRefundAmount("custom", { ...ctx, customAmount: 10.5 })).toThrow(/entero/);
    expect(() => resolveRefundAmount("custom", { ...ctx, customAmount: NaN })).toThrow(/entero/);
  });

  it("policy sin startsAt → error; full con boleta viva 0 → error", () => {
    expect(() => resolveRefundAmount("policy", { ...ctx, startsAt: null })).toThrow(/pago asociado/);
    expect(() => resolveRefundAmount("full", { ...ctx, liveBoleta: 0 })).toThrow(/saldo/);
  });
});
