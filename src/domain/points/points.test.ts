import { describe, expect, it } from "vitest";
import {
  applyRedemption,
  clampPoints,
  clawbackAmount,
  computeEarn,
  EARN_RATE,
  restoreAmount,
  restoreTarget,
} from "./points";

describe("computeEarn", () => {
  it("5% del efectivo, floor a entero", () => {
    expect(EARN_RATE).toBe(0.05);
    expect(computeEarn(19990)).toBe(999);
    expect(computeEarn(26980)).toBe(1349);
    expect(computeEarn(20000)).toBe(1000);
  });

  it("bordes: efectivo chico o cero no gana nada", () => {
    expect(computeEarn(19)).toBe(0);
    expect(computeEarn(0)).toBe(0);
  });
});

describe("claw-back por estado objetivo (reembolsos parciales)", () => {
  // Caso canónico del spec: C=20000, P=5000, earn=1000.
  const C = 20000;
  const P = 5000;

  it("primer parcial (R=6000): revoca 300 y repone 1500", () => {
    const earnNet = computeEarn(C); // 1000
    expect(clawbackAmount(earnNet, C, 6000)).toBe(300); // 1000 − floor(0.05·14000)=700
    expect(restoreTarget(P, C, 6000)).toBe(1500); // floor(5000·6000/20000)
    expect(restoreAmount(1500, 0)).toBe(1500);
  });

  it("segundo parcial completa (R=20000): earn neto 0 y repone exactamente P", () => {
    const earnNetTrasR1 = 1000 - 300;
    expect(clawbackAmount(earnNetTrasR1, C, 20000)).toBe(700);
    expect(restoreTarget(P, C, 20000)).toBe(5000);
    expect(restoreAmount(5000, 1500)).toBe(3500);
    // suma total repuesta = 1500 + 3500 = P exacto, sin polvo de redondeo
  });

  it("replays convergen: recomputar con el mismo R no revoca ni repone de más", () => {
    const earnNetFinal = 1000 - 300 - 700;
    expect(clawbackAmount(earnNetFinal, C, 20000)).toBe(0);
    expect(restoreAmount(restoreTarget(P, C, 20000), 5000)).toBe(0);
  });

  it("nunca devuelve montos negativos", () => {
    expect(clawbackAmount(0, C, 20000)).toBe(0);
    expect(restoreAmount(1500, 5000)).toBe(0);
  });
});

describe("applyRedemption", () => {
  const quote = { total: 26980, net: 22672 };

  it("efectivo + puntos suman el total y net+tax suman el efectivo", () => {
    const r = applyRedemption(quote, 10000);
    expect(r.pointsApplied).toBe(10000);
    expect(r.cashTotal + r.pointsApplied).toBe(quote.total);
    expect(r.cashNet + r.cashTax).toBe(r.cashTotal);
  });

  it("capa al total (canje 100% → efectivo 0, net/tax 0)", () => {
    const r = applyRedemption(quote, 999999);
    expect(r.pointsApplied).toBe(quote.total);
    expect(r.cashTotal).toBe(0);
    expect(r.cashNet).toBe(0);
    expect(r.cashTax).toBe(0);
  });

  it("pedidos raros se sanean: negativos y decimales", () => {
    expect(applyRedemption(quote, -50).pointsApplied).toBe(0);
    expect(applyRedemption(quote, 100.9).pointsApplied).toBe(100);
  });

  it("sin canje: passthrough del quote", () => {
    const r = applyRedemption(quote, 0);
    expect(r).toEqual({ pointsApplied: 0, cashTotal: 26980, cashNet: 22672, cashTax: 4308 });
  });
});

describe("clampPoints (input del widget)", () => {
  it("acota a saldo y total", () => {
    expect(clampPoints(4200, 26980, 999999)).toBe(4200);
    expect(clampPoints(50000, 26980, 999999)).toBe(26980);
    expect(clampPoints(4200, 26980, 1000)).toBe(1000);
  });

  it("negativos/decimales → saneados", () => {
    expect(clampPoints(4200, 26980, -5)).toBe(0);
    expect(clampPoints(4200, 26980, 10.7)).toBe(10);
  });
});
