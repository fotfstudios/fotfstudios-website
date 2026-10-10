import { describe, expect, it } from "vitest";
import { beatcoinsExpiryLine } from "./beatcoins-expiry-copy";

describe("beatcoinsExpiryLine", () => {
  it("lo que vence, cuándo (hora de Chile) y lo que no vence", () => {
    expect(beatcoinsExpiryLine({ balance: 1500, protected: 1000, activityAt: "2027-03-15T18:00:00Z" })).toBe(
      "500 vencen el 15 de marzo de 2028 · 1.000 no vencen. Cada reserva reinicia el plazo.",
    );
  });
  it("todo vence", () => {
    expect(beatcoinsExpiryLine({ balance: 2500, protected: 0, activityAt: "2027-03-15T18:00:00Z" })).toBe(
      "2.500 vencen el 15 de marzo de 2028. Cada reserva reinicia el plazo.",
    );
  });
  it("nada vence", () => {
    expect(beatcoinsExpiryLine({ balance: 800, protected: 800, activityAt: null })).toBe("No vencen.");
  });
  it("sin saldo no hay línea", () => {
    expect(beatcoinsExpiryLine({ balance: 0, protected: 0, activityAt: null })).toBeNull();
    expect(beatcoinsExpiryLine({ balance: -50, protected: 0, activityAt: null })).toBeNull();
  });
});
