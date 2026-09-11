import { describe, expect, it } from "vitest";
import { concessionFromLines, engineAdjustFor, orderLinesFromQuote } from "./order-lines";
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

/**
 * Fixture = la reserva real que destapó el defecto (Patricio, 2026-08-24): Vie
 * 2h punta finde + grabación audio+video, cotizada en 75.970 por el motor y
 * cobrada en 67.970 tras un descuento manual de 8.000 sobre la grabación.
 */
const conDescuento: Quote = {
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

const lineasDeEsePedido = [
  { line_type: "room_time" as const, description: "Sala · 2h (puntaFinde)", subtotal_clp: 39980 },
  { line_type: "discount" as const, description: "Descuento por volumen (10%)", subtotal_clp: -4000 },
  { line_type: "flat_service" as const, description: "Grabación audio + video", subtotal_clp: 39990 },
  { line_type: "discount" as const, description: "Descuento 20% Grabación audio + video", subtotal_clp: -8000 },
];

describe("engineAdjustFor", () => {
  it("es exactamente el monto de la línea que escribe el motor", () => {
    expect(engineAdjustFor(conDescuento)).toBe(-4000);
    const delMotor = orderLinesFromQuote(conDescuento).find((l) => l.line_type === "discount");
    expect(delMotor?.subtotal_clp).toBe(engineAdjustFor(conDescuento));
  });
});

describe("concessionFromLines", () => {
  it("separa el descuento manual del que calcula el motor", () => {
    expect(concessionFromLines(lineasDeEsePedido, conDescuento)).toEqual({
      amount: 8000,
      description: "Descuento 20% Grabación audio + video",
    });
  });

  it("las líneas suman el efectivo cobrado, y la concesión es la diferencia con el motor", () => {
    const cobrado = lineasDeEsePedido.reduce((s, l) => s + l.subtotal_clp, 0);
    expect(cobrado).toBe(67970);
    expect(conDescuento.total - cobrado).toBe(concessionFromLines(lineasDeEsePedido, conDescuento).amount);
  });

  it("sin descuento manual → 0 (no confunde la línea del motor con una concesión)", () => {
    const soloMotor = lineasDeEsePedido.filter((l) => l.subtotal_clp !== -8000);
    expect(concessionFromLines(soloMotor, conDescuento).amount).toBe(0);
  });

  it("no cuenta el canje de puntos como concesión", () => {
    const conCanje = [
      ...lineasDeEsePedido,
      { line_type: "discount" as const, description: "Canje de puntos", subtotal_clp: -5000 },
    ];
    expect(concessionFromLines(conCanje, conDescuento).amount).toBe(8000);
  });

  it("sin snapshot no se puede reconocer la línea del motor → 0 (comportamiento previo)", () => {
    expect(concessionFromLines(lineasDeEsePedido, null).amount).toBe(0);
  });

  it("descuento manual que COINCIDE en monto con el del motor: descuenta uno solo", () => {
    // Dos líneas de −4.000: una es del motor, la otra es la concesión.
    const empate = [
      { line_type: "room_time" as const, description: "Sala · 2h (puntaFinde)", subtotal_clp: 39980 },
      { line_type: "discount" as const, description: "Descuento por volumen (10%)", subtotal_clp: -4000 },
      { line_type: "flat_service" as const, description: "Grabación audio + video", subtotal_clp: 39990 },
      { line_type: "discount" as const, description: "Descuento · gentileza", subtotal_clp: -4000 },
    ];
    expect(concessionFromLines(empate, conDescuento)).toEqual({
      amount: 4000,
      description: "Descuento · gentileza",
    });
  });

  it("varias concesiones se suman y sus glosas se concatenan", () => {
    const dos = [
      ...lineasDeEsePedido,
      { line_type: "discount" as const, description: "Descuento · amigo del estudio", subtotal_clp: -2000 },
    ];
    expect(concessionFromLines(dos, conDescuento)).toEqual({
      amount: 10000,
      description: "Descuento 20% Grabación audio + video · Descuento · amigo del estudio",
    });
  });
});
