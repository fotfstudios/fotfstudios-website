import { describe, expect, it } from "vitest";
import { BEATCOINS_EXPIRY_FROM, beatcoinsExpiresAt, beatcoinsExpiry, expirableAmount, expiresSoon } from "./expiry";

describe("expirableAmount", () => {
  it.each([
    [1500, 1000, 500],
    [800, 1000, 0],
    [-200, 0, 0],
    [400, 0, 400],
  ])("saldo %i, protegidos %i → vencen %i", (balance, prot, out) => {
    expect(expirableAmount(balance, prot)).toBe(out);
  });
});

describe("beatcoinsExpiresAt", () => {
  it("12 meses desde la última reserva", () => {
    expect(beatcoinsExpiresAt("2027-03-15T18:00:00Z").toISOString()).toBe("2028-03-15T18:00:00.000Z");
  });
  it("nunca antes de 12 meses desde el corte", () => {
    const fromCutoff = beatcoinsExpiresAt(null).toISOString();
    expect(fromCutoff).toBe("2027-11-10T03:00:00.000Z");
    expect(beatcoinsExpiresAt("2026-01-01T00:00:00Z").toISOString()).toBe(fromCutoff);
  });
  it("el corte es medianoche de Chile", () => {
    expect(new Date(BEATCOINS_EXPIRY_FROM).toISOString()).toBe("2026-11-10T03:00:00.000Z");
  });
});

describe("beatcoinsExpiry", () => {
  it("separa lo que vence de lo permanente", () => {
    expect(beatcoinsExpiry({ balance: 1500, protected: 1000, activityAt: "2027-03-15T18:00:00Z" })).toEqual({
      expiring: 500,
      permanent: 1000,
      expiresAt: new Date("2028-03-15T18:00:00Z"),
    });
  });
  it("sin nada que venza no hay fecha", () => {
    expect(beatcoinsExpiry({ balance: 800, protected: 800, activityAt: null })).toEqual({ expiring: 0, permanent: 800, expiresAt: null });
  });
  it("con deuda, nada vence ni queda permanente", () => {
    expect(beatcoinsExpiry({ balance: -100, protected: 0, activityAt: null })).toEqual({ expiring: 0, permanent: 0, expiresAt: null });
  });
});

describe("expiresSoon", () => {
  const e = beatcoinsExpiry({ balance: 500, protected: 0, activityAt: "2027-03-15T18:00:00Z" });
  it.each([
    ["2028-02-10T00:00:00Z", false],
    ["2028-02-20T00:00:00Z", true],
  ])("al %s → %s", (now, out) => {
    expect(expiresSoon(e, new Date(now))).toBe(out);
  });
  it("nada que venza → nunca", () => {
    expect(expiresSoon(beatcoinsExpiry({ balance: 5, protected: 5, activityAt: null }), new Date("2099-01-01"))).toBe(false);
  });
});
