import { describe, expect, it } from "vitest";
import { summaryLines } from "./booking-summary";

const QUOTE = {
  tierLines: [
    { key: "valle", hours: 1, rate: 9990, subtotal: 9990 },
    { key: "puntaSemana", hours: 1, rate: 14990, subtotal: 14990 },
  ],
  addonLines: [
    { key: "rec_audio", name: "Grabación de audio", amount: 9990 },
    { key: "guided", name: "Sesión 1:1 guiada", amount: 29980 },
  ],
  adjust: { description: "Descuento por volumen (10%)", amount: -2500 },
};

describe("summaryLines", () => {
  it("tramos con horas × tarifa, extras (los por hora con la duración) y descuentos en oro", () => {
    const lines = summaryLines({
      quote: QUOTE,
      duration: 2,
      hourlyKeys: new Set(["guided"]),
      promoLine: { description: "Descuento 20% sala · primera reserva", amount: 5000 },
      pointsApplied: 3000,
    });
    expect(lines).toEqual([
      { label: "Valle · 1h × $9.990", value: "$9.990", gold: false },
      { label: "Punta semana · 1h × $14.990", value: "$14.990", gold: false },
      { label: "Grabación de audio", value: "$9.990", gold: false },
      { label: "Sesión 1:1 guiada · 2h", value: "$29.980", gold: false },
      { label: "Descuento por volumen (10%)", value: "−$2.500", gold: true },
      { label: "Descuento 20% sala · primera reserva", value: "−$5.000", gold: true },
      { label: "Beatcoins", value: "−$3.000", gold: true },
    ]);
  });

  it("sin cotización no hay líneas; un ajuste positivo va con +", () => {
    expect(summaryLines({ quote: null, duration: 1, hourlyKeys: new Set(), promoLine: null, pointsApplied: 0 })).toEqual([]);
    const up = summaryLines({
      quote: { ...QUOTE, addonLines: [], adjust: { description: "Recargo", amount: 1000 } },
      duration: 1,
      hourlyKeys: new Set(),
      promoLine: null,
      pointsApplied: 0,
    });
    expect(up.at(-1)).toEqual({ label: "Recargo", value: "+$1.000", gold: true });
  });
});
