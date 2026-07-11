import { describe, expect, it } from "vitest";
import { orderLinesFromQuote } from "./order-lines";
import type { Quote } from "./types";

// net/tax no los usa el constructor de líneas (solo tierLines/addonLines/addonsTotal/total/volumePct).
const base: Quote = {
  tierLines: [{ key: "valle", hours: 1, rate: 9990, subtotal: 9990 }],
  addonLines: [],
  roomSubtotal: 9990,
  volumePct: 0,
  discount: 0,
  addonsTotal: 0,
  total: 9990,
  net: 0,
  tax: 0,
  endMinute: 660,
};

describe("orderLinesFromQuote", () => {
  it("una hora sin add-ons ni descuento → una sola línea room_time", () => {
    expect(orderLinesFromQuote(base)).toEqual([
      {
        line_type: "room_time",
        description: "Sala · 1h (valle)",
        quantity: 1,
        unit_price_clp: 9990,
        subtotal_clp: 9990,
      },
    ]);
  });

  it("con add-on → agrega una línea flat_service con addon_key", () => {
    const q: Quote = {
      ...base,
      addonLines: [{ key: "guided", name: "Sesión 1:1 guiada", amount: 14990 }],
      addonsTotal: 14990,
      total: 24980,
    };
    expect(orderLinesFromQuote(q)).toContainEqual({
      line_type: "flat_service",
      addon_key: "guided",
      description: "Sesión 1:1 guiada",
      quantity: 1,
      unit_price_clp: 14990,
      subtotal_clp: 14990,
    });
  });

  it("descuento por volumen → línea discount que hace SUMAR las líneas al total cobrado", () => {
    // 2h valle = 19980, volumen 10% → total redondeado 17980; ajuste = −2000.
    const q: Quote = {
      ...base,
      tierLines: [{ key: "valle", hours: 2, rate: 9990, subtotal: 19980 }],
      roomSubtotal: 19980,
      volumePct: 0.1,
      total: 17980,
      endMinute: 720,
    };
    const lines = orderLinesFromQuote(q);
    expect(lines.reduce((s, l) => s + l.subtotal_clp, 0)).toBe(17980);
    expect(lines.find((l) => l.line_type === "discount")?.description).toMatch(/volumen/i);
  });
});
