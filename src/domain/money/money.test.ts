import { describe, expect, it } from "vitest";
import {
  discountAmount,
  formatCLP,
  netFromGrossInclusive,
  roundTo,
  taxFromGrossInclusive,
} from "./money";

describe("money", () => {
  it("roundTo redondea al múltiplo", () => {
    expect(roundTo(22482, 10)).toBe(22480);
    expect(roundTo(26982, 10)).toBe(26980);
    expect(roundTo(9990, 10)).toBe(9990);
    expect(roundTo(50974.5, 10)).toBe(50970);
  });

  it("discountAmount aplica el porcentaje", () => {
    expect(discountAmount(24980, 0.1)).toBe(2498);
    expect(discountAmount(59970, 0.15)).toBe(8996); // 8995.5 → 8996
    expect(discountAmount(39960, 0.2)).toBe(7992);
  });

  it("neto + IVA cuadran con el bruto (IVA incluido)", () => {
    for (const gross of [9990, 14990, 19990, 41960, 50970]) {
      const net = netFromGrossInclusive(gross, 0.19);
      const tax = taxFromGrossInclusive(gross, 0.19);
      expect(net + tax).toBe(gross);
      expect(net).toBeGreaterThan(0);
      expect(tax).toBeGreaterThan(0);
    }
    expect(netFromGrossInclusive(9990, 0.19)).toBe(8395);
    expect(taxFromGrossInclusive(9990, 0.19)).toBe(1595);
  });

  it("formatCLP usa separador de miles es-CL", () => {
    expect(formatCLP(14990)).toBe("$14.990");
    expect(formatCLP(9990)).toBe("$9.990");
  });
});
