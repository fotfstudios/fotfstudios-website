import { describe, expect, it } from "vitest";
import { splitRefundAcrossPayments } from "./refund-split";

describe("splitRefundAcrossPayments", () => {
  it("un solo pago: todo el reembolso va a ese pago", () => {
    const out = splitRefundAcrossPayments([{ liveAmount: 9990, paymentId: "p1" }], 2000);
    expect(out).toEqual([{ paymentId: "p1", amount: 2000 }]);
  });

  it("reembolso que cabe en la boleta más antigua NO toca la segunda", () => {
    const out = splitRefundAcrossPayments(
      [
        { liveAmount: 9990, paymentId: "p1" },
        { liveAmount: 3000, paymentId: "p2" },
      ],
      4990,
    );
    expect(out).toEqual([{ paymentId: "p1", amount: 4990 }]);
  });

  it("reembolso que desborda la primera boleta se reparte a la segunda (por-pago)", () => {
    const out = splitRefundAcrossPayments(
      [
        { liveAmount: 9990, paymentId: "p1" },
        { liveAmount: 3000, paymentId: "p2" },
      ],
      10990,
    );
    expect(out).toEqual([
      { paymentId: "p1", amount: 9990 },
      { paymentId: "p2", amount: 1000 },
    ]);
  });

  it("reembolso total agota ambos pagos con sus montos exactos", () => {
    const out = splitRefundAcrossPayments(
      [
        { liveAmount: 9990, paymentId: "p1" },
        { liveAmount: 3000, paymentId: "p2" },
      ],
      12990,
    );
    expect(out).toEqual([
      { paymentId: "p1", amount: 9990 },
      { paymentId: "p2", amount: 3000 },
    ]);
  });

  it("agrega por pago cuando dos boletas comparten el mismo pago", () => {
    const out = splitRefundAcrossPayments(
      [
        { liveAmount: 5000, paymentId: "p1" },
        { liveAmount: 4000, paymentId: "p1" },
      ],
      7000,
    );
    expect(out).toEqual([{ paymentId: "p1", amount: 7000 }]);
  });

  it("preserva pagos offline (paymentId null) en el reparto", () => {
    const out = splitRefundAcrossPayments(
      [
        { liveAmount: 9990, paymentId: null },
        { liveAmount: 3000, paymentId: "p2" },
      ],
      12990,
    );
    expect(out).toEqual([
      { paymentId: null, amount: 9990 },
      { paymentId: "p2", amount: 3000 },
    ]);
  });
});
