import { describe, expect, it } from "vitest";
import { checkoutItems, ROOM_ITEM } from "./booking-items";

describe("checkoutItems (items GA4 del checkout)", () => {
  it("la sala como 1 ítem con cantidad = horas y precio promedio por hora; extras aparte", () => {
    const items = checkoutItems({
      quote: {
        roomSubtotal: 24980,
        addonLines: [{ key: "rec_audio", name: "Grabación de audio", amount: 9990 }],
      },
      duration: 2,
    });
    expect(items).toEqual([
      { ...ROOM_ITEM, price: 12490, quantity: 2 },
      { item_id: "rec_audio", item_name: "Grabación de audio", price: 9990, quantity: 1 },
    ]);
  });

  it("sin cotización no hay items", () => {
    expect(checkoutItems({ quote: null, duration: 1 })).toEqual([]);
  });
});
