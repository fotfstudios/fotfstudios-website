import { describe, expect, it } from "vitest";
import { applyManualDiscount, resolveDiscountBase } from "./manual-discount";
import type { Quote } from "./types";

/**
 * Fixture = la reserva real que motivó la feature: Vie 19:00, 2h punta finde
 * (19.990/h) + grabación audio+video. Sala 39.980 − 10% volumen + 39.990
 * → total redondeado 75.970.
 */
const quote: Quote = {
  tierLines: [{ key: "puntaFinde", hours: 2, rate: 19990, subtotal: 39980 }],
  addonLines: [{ key: "audioVideo", name: "Grabación audio + video", amount: 39990 }],
  roomSubtotal: 39980,
  volumePct: 0.1,
  discount: 3998,
  addonsTotal: 39990,
  total: 75970,
  net: 63840,
  tax: 12130,
  endMinute: 1260,
};

describe("resolveDiscountBase", () => {
  it("sala = subtotal ANTES del descuento por volumen (los % se suman, no se componen)", () => {
    expect(resolveDiscountBase(quote, { kind: "room" })).toBe(39980);
  });

  it("add-on = el monto de ese add-on", () => {
    expect(resolveDiscountBase(quote, { kind: "addon", key: "audioVideo" })).toBe(39990);
  });

  it("total = el total ya redondeado", () => {
    expect(resolveDiscountBase(quote, { kind: "total" })).toBe(75970);
  });

  it("add-on ausente → null", () => {
    expect(resolveDiscountBase(quote, { kind: "addon", key: "audio" })).toBeNull();
  });
});

describe("applyManualDiscount — modo porcentaje", () => {
  it("20% sobre la sala se redondea a $10 y baja el total", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "room" },
      mode: "pct",
      value: 20,
      reason: "primera reserva",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.amount).toBe(8000); // 39.980 × 20% = 7.996 → $10 más cercano
    expect(r.value.cashTotal).toBe(67970);
  });

  it("rotula la línea con el porcentaje y el motivo", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "room" },
      mode: "pct",
      value: 20,
      reason: "primera reserva",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.description).toBe("Descuento 20% sala · primera reserva");
  });

  it("un add-on regalado (100%) descuenta justo ese add-on", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "addon", key: "audioVideo" },
      mode: "pct",
      value: 100,
      reason: "cortesía grabación",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.amount).toBe(39990);
    expect(r.value.cashTotal).toBe(35980);
  });
});

describe("applyManualDiscount — modo monto", () => {
  it("el monto exacto se respeta sin redondear (para calzar un total prometido)", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "amount",
      value: 7994,
      reason: "primera reserva",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.amount).toBe(7994);
    expect(r.value.cashTotal).toBe(67976); // el total prometido por WhatsApp
  });

  it("rotula sin porcentaje", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "amount",
      value: 7994,
      reason: "primera reserva",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.description).toBe("Descuento · primera reserva");
  });
});

describe("applyManualDiscount — IVA", () => {
  it("reparte neto/IVA proporcional al efectivo y cuadra net + tax === cash", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "room" },
      mode: "pct",
      value: 20,
      reason: "primera reserva",
    });
    if (!r.ok) throw new Error(r.error);
    const { cashTotal, cashNet, cashTax } = r.value;
    expect(cashNet + cashTax).toBe(cashTotal);
    expect(cashNet).toBe(Math.round((cashTotal * quote.net) / quote.total));
  });
});

describe("applyManualDiscount — guardas", () => {
  it("rechaza un descuento igual al total (eso es cortesía)", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "pct",
      value: 100,
      reason: "todo gratis",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cortesía/i);
  });

  it("rechaza un descuento mayor al total", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "amount",
      value: 80000,
      reason: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("rechaza un add-on que no está en la reserva", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "addon", key: "audio" },
      mode: "pct",
      value: 50,
      reason: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/add-on/i);
  });

  it("rechaza un descuento que se anula al redondear", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "amount",
      value: 0,
      reason: "x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("applyManualDiscount — nunca descuenta más que su base", () => {
  // Add-on de precio no múltiplo de $10: 100% redondeado a $10 se pasaría por $5.
  const odd: Quote = {
    ...quote,
    addonLines: [{ key: "audio", name: "Grabación de audio", amount: 9995 }],
    addonsTotal: 9995,
    total: 45975,
    net: 38634,
    tax: 7341,
  };

  it("pct: el redondeo a $10 se capa a la base (no regala $5 de más)", () => {
    const r = applyManualDiscount(odd, {
      target: { kind: "addon", key: "audio" },
      mode: "pct",
      value: 100,
      reason: "cortesía",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.amount).toBe(9995);
  });

  it("amount: un monto mayor que la base se rechaza (error explícito, no capeo mudo)", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "room" },
      mode: "amount",
      value: 50000, // > sala 39.980, aunque < total 75.970
      reason: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sala/i);
  });
});

describe("applyManualDiscount — rango del valor", () => {
  // La consola previsualiza con esta misma función. Si acá un 999% "funciona"
  // (capado a la base) pero el validador del server lo rechaza, el staff ve un
  // total que nunca se va a cobrar. El rango vive acá para que ambos coincidan.
  it.each([0, 101, 999, -5, 20.5])("rechaza el porcentaje %j", (value) => {
    const r = applyManualDiscount(quote, {
      target: { kind: "room" },
      mode: "pct",
      value,
      reason: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("acepta los extremos del rango (1% y 100%)", () => {
    for (const value of [1, 100]) {
      const r = applyManualDiscount(quote, {
        target: { kind: "addon", key: "audioVideo" },
        mode: "pct",
        value,
        reason: "x",
      });
      expect(r.ok).toBe(true);
    }
  });

  it("rechaza montos no enteros", () => {
    const r = applyManualDiscount(quote, {
      target: { kind: "total" },
      mode: "amount",
      value: 1000.5,
      reason: "x",
    });
    expect(r.ok).toBe(false);
  });
});
