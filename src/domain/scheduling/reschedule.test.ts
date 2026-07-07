import { describe, expect, it } from "vitest";
import { classifyReschedule } from "./reschedule";

/**
 * Clasifica el delta de precio al reagendar contra la boleta viva actual
 * (total − ya reembolsado). El monto del delta siempre es positivo; el signo lo
 * lleva el `kind`.
 */
describe("classifyReschedule", () => {
  it("mismo precio → equal (sin plata)", () => {
    expect(classifyReschedule(9990, 9990)).toEqual({ kind: "equal" });
  });

  it("nuevo más barato → refund por la diferencia", () => {
    expect(classifyReschedule(19990, 9990)).toEqual({ kind: "refund", amount: 10000 });
  });

  it("nuevo más caro → charge por la diferencia", () => {
    expect(classifyReschedule(9990, 19990)).toEqual({ kind: "charge", amount: 10000 });
  });
});
