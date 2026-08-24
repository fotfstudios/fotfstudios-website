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

  it("con enforceLeadTime:false permite un inicio dentro de la ventana (walk-in admin)", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const soon = new Date(Date.now() + 5 * 60_000).toISOString(); // 5 min < 30 min de lead
    const svc = new CheckoutService(fakePricing(soon, soon), repo);

    const r = await svc.createBooking(input, { enforceLeadTime: false });

    expect(r.ok).toBe(true);
    expect(repo.createCheckout).toHaveBeenCalledOnce();
  });

  it("con enforceLeadTime:false igual rechaza el pasado", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn() };
    const svc = new CheckoutService(fakePricing("2020-01-01T12:00:00.000Z", "2020-01-01T13:00:00.000Z"), repo);

    const r = await svc.createBooking(input, { enforceLeadTime: false });

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

// Quote simple sin línea de ajuste: las tierLines suman exactamente el total.
const PRICED_QUOTE = {
  tierLines: [{ key: "valle", hours: 2, rate: 10000, subtotal: 20000 }],
  addonLines: [],
  addonsTotal: 0,
  total: 20000,
  net: 16807,
  tax: 3193,
  volumePct: 0,
} as unknown as Quote;

function pricedPricing(): PricingService {
  const value: BookingQuote = {
    quote: PRICED_QUOTE,
    currency: "CLP",
    startsAt: "2999-01-01T12:00:00.000Z",
    endsAt: "2999-01-01T14:00:00.000Z",
  };
  return { quoteBooking: vi.fn().mockResolvedValue(ok(value)) } as unknown as PricingService;
}

describe("CheckoutService.createBooking — canje de puntos", () => {
  it("canje parcial: línea de descuento y efectivo/net/tax proporcionales", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, customerId: "cust-1", pointsToRedeem: 5000 });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pointsApplied).toBe(5000);
      expect(r.value.amount).toBe(15000);
      expect(r.value.paidWithPoints).toBe(false);
    }
    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.amount).toBe(15000);
    expect(params.net + params.tax).toBe(15000);
    expect(params.customerId).toBe("cust-1");
    expect(params.pointsRedeemed).toBe(5000);
    expect(params.lines).toContainEqual(
      expect.objectContaining({ line_type: "discount", description: "Canje de puntos", subtotal_clp: -5000 }),
    );
    // Las líneas siguen sumando exactamente el efectivo cobrado.
    expect(params.lines.reduce((s, l) => s + l.subtotal_clp, 0)).toBe(15000);
  });

  it("canje 100%: efectivo 0 y paidWithPoints", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, customerId: "cust-1", pointsToRedeem: 20000 });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.amount).toBe(0);
      expect(r.value.pointsApplied).toBe(20000);
      expect(r.value.paidWithPoints).toBe(true);
    }
    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.net).toBe(0);
    expect(params.tax).toBe(0);
  });

  it("el canje se capa al total del quote (el saldo lo valida la DB)", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, customerId: "cust-1", pointsToRedeem: 999999 });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.pointsApplied).toBe(20000);
  });

  it("puntos sin sesión de cliente → points_session, sin tocar la DB", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn() };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, pointsToRedeem: 5000 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("points_session");
    expect(repo.createCheckout).not.toHaveBeenCalled();
  });

  it("saldo insuficiente (raise de la DB) → insufficient_points", async () => {
    const repo: CheckoutRepository = {
      createCheckout: vi.fn().mockRejectedValue(new Error("insufficient_points")),
    };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking({ ...input, customerId: "cust-1", pointsToRedeem: 5000 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("insufficient_points");
  });

  it("sin puntos: sin línea de canje y pointsApplied 0", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    const r = await svc.createBooking(input);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pointsApplied).toBe(0);
      expect(r.value.amount).toBe(20000);
    }
    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.lines.some((l) => l.description === "Canje de puntos")).toBe(false);
  });
});

describe("CheckoutService.createBooking — consentimiento T&C", () => {
  it("propaga termsSource y termsVersion a la DB", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    await svc.createBooking({ ...input, termsSource: "customer", termsVersion: "2026-07-06" });

    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.termsSource).toBe("customer");
    expect(params.termsVersion).toBe("2026-07-06");
  });

  it("sin consentimiento: termsSource/termsVersion quedan undefined", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    await svc.createBooking(input);

    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.termsSource).toBeUndefined();
    expect(params.termsVersion).toBeUndefined();
  });
});

describe("CheckoutService.createBooking — hold firme (opt firmHold)", () => {
  it("con firmHold:true, holdTtlMinutes viaja null (hold sin expiración)", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    await svc.createBooking(input, { firmHold: true });

    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.holdTtlMinutes).toBeNull();
  });

  it("sin firmHold, holdTtlMinutes queda undefined (TTL por defecto de 10 min)", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(pricedPricing(), repo);

    await svc.createBooking(input);
    let params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.holdTtlMinutes).toBeUndefined();

    await svc.createBooking(input, { enforceLeadTime: false });
    params = vi.mocked(repo.createCheckout).mock.calls[1][0];
    expect(params.holdTtlMinutes).toBeUndefined();
  });
});

// Quote con sala identificable: los targets del descuento manual se resuelven
// contra el quote del SERVIDOR, así que necesita roomSubtotal/addonLines reales.
const DISCOUNTABLE_QUOTE = {
  tierLines: [{ key: "valle", hours: 2, rate: 10000, subtotal: 20000 }],
  addonLines: [{ key: "audio", name: "Grabación de audio", amount: 10000 }],
  roomSubtotal: 20000,
  addonsTotal: 10000,
  total: 30000,
  net: 25210,
  tax: 4790,
  volumePct: 0,
} as unknown as Quote;

function discountablePricing(): PricingService {
  const value: BookingQuote = {
    quote: DISCOUNTABLE_QUOTE,
    currency: "CLP",
    startsAt: "2999-01-01T12:00:00.000Z",
    endsAt: "2999-01-01T14:00:00.000Z",
  };
  return { quoteBooking: vi.fn().mockResolvedValue(ok(value)) } as unknown as PricingService;
}

const DISCOUNT_20_SALA = {
  target: { kind: "room" as const },
  mode: "pct" as const,
  value: 20,
  reason: "primera reserva",
};

describe("CheckoutService.createBooking — descuento manual del admin", () => {
  it("agrega una línea negativa y rebaja monto/neto/IVA", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(discountablePricing(), repo);

    const r = await svc.createBooking({ ...input, manualDiscount: DISCOUNT_20_SALA });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(26000); // 30.000 − 20% de la sala (4.000)
    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.amount).toBe(26000);
    expect(params.net + params.tax).toBe(26000);
    expect(params.lines).toContainEqual(
      expect.objectContaining({
        line_type: "discount",
        description: "Descuento 20% sala · primera reserva",
        subtotal_clp: -4000,
      }),
    );
    // Invariante del esquema: las líneas suman exactamente el efectivo cobrado.
    expect(params.lines.reduce((s, l) => s + l.subtotal_clp, 0)).toBe(26000);
  });

  it("el descuento se aplica ANTES del canje: los puntos se descuentan del total ya rebajado", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(discountablePricing(), repo);

    const r = await svc.createBooking({
      ...input,
      customerId: "cust-1",
      pointsToRedeem: 5000,
      manualDiscount: DISCOUNT_20_SALA,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pointsApplied).toBe(5000);
      expect(r.value.amount).toBe(21000); // 30.000 − 4.000 descuento − 5.000 puntos
    }
    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.lines.reduce((s, l) => s + l.subtotal_clp, 0)).toBe(21000);
  });

  it("regalar un add-on descuenta justo ese add-on", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(discountablePricing(), repo);

    const r = await svc.createBooking({
      ...input,
      manualDiscount: { target: { kind: "addon", key: "audio" }, mode: "pct", value: 100, reason: "cortesía" },
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBe(20000);
  });

  it("descuento inválido → error prefijado 'discount:' y sin tocar la DB", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn() };
    const svc = new CheckoutService(discountablePricing(), repo);

    const r = await svc.createBooking({
      ...input,
      manualDiscount: { target: { kind: "total" }, mode: "pct", value: 100, reason: "gratis" },
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^discount:/);
    expect(repo.createCheckout).not.toHaveBeenCalled();
  });

  it("sin descuento: ninguna línea de descuento manual", async () => {
    const repo: CheckoutRepository = { createCheckout: vi.fn().mockResolvedValue("ord_1") };
    const svc = new CheckoutService(discountablePricing(), repo);

    await svc.createBooking(input);

    const params = vi.mocked(repo.createCheckout).mock.calls[0][0];
    expect(params.lines.some((l) => l.line_type === "discount")).toBe(false);
    expect(params.amount).toBe(30000);
  });
});
