import { describe, expect, it } from "vitest";
import { validateBookingContact } from "./booking-contact";

describe("validateBookingContact", () => {
  it("normaliza: nombre recortado y celular como +569XXXXXXXX", () => {
    expect(validateBookingContact({ name: "  Felipe M. DJ ", phone: "9 9988 7766" })).toEqual({
      name: "Felipe M. DJ",
      phone: "+56999887766",
    });
    expect(validateBookingContact({ name: "Nico", phone: "+56 9 6280 3298" }).phone).toBe("+56962803298");
  });

  it("exige nombre (≤ 80) y celular chileno", () => {
    expect(() => validateBookingContact({ name: "  ", phone: "9 9988 7766" })).toThrow(/nombre/);
    expect(() => validateBookingContact({ name: "N".repeat(81), phone: "9 9988 7766" })).toThrow(/80/);
    expect(() => validateBookingContact({ name: "Nico", phone: "2 2345 6789" })).toThrow(/celular/);
  });

  it("un celular vacío queda vacío (la ficha puede no tenerlo aún); el checkout lo pide igual", () => {
    expect(validateBookingContact({ name: "Nico", phone: "  " })).toEqual({ name: "Nico", phone: null });
  });
});
