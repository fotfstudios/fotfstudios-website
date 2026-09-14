import { describe, expect, it } from "vitest";
import { FIRST_BOOKING_PROMO, firstBookingDiscountInput } from "./first-booking-promo";
import { applyManualDiscount } from "./manual-discount";
import type { Quote } from "./types";

/** Misma reserva que en manual-discount.test: Vie 19:00 2h punta finde + audio+video. */
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

describe("promo primera reserva — parámetros", () => {
  it("es un 20% sobre la sala, en modo porcentaje, con el motivo 'primera reserva'", () => {
    expect(FIRST_BOOKING_PROMO.enabled).toBe(true);
    expect(firstBookingDiscountInput()).toEqual({
      target: { kind: "room" },
      mode: "pct",
      value: 20,
      reason: "primera reserva",
    });
  });

  it("aplicada con el descuento manual produce la glosa canónica y $10 de redondeo", () => {
    const r = applyManualDiscount(quote, firstBookingDiscountInput());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.description).toBe("Descuento 20% sala · primera reserva");
    expect(r.value.amount).toBe(8000); // 39.980 × 20% = 7.996 → $10 más cercano
    expect(r.value.cashTotal).toBe(67970);
  });

  it("se SUMA al descuento por volumen (10% + 20% = 30% de la sala) y no toca los add-ons", () => {
    const r = applyManualDiscount(quote, firstBookingDiscountInput());
    if (!r.ok) throw new Error(r.error);
    // Sala 39.980: volumen 3.998 + promo 8.000 ≈ 30% (redondeos aparte); add-on intacto.
    expect(quote.discount + r.value.amount).toBeCloseTo(39980 * 0.3, -2);
    expect(r.value.cashTotal - 39990).toBe(75970 - 39990 - 8000);
  });
});
