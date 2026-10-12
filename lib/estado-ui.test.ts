import { describe, expect, it } from "vitest";
import { isFreshPurchase, resolveEstadoUi } from "./estado-ui";

describe("resolveEstadoUi", () => {
  it("pagado o cumplido → confirmada; pagado con hold vencido → paid_no_hold", () => {
    expect(resolveEstadoUi("paid", "confirmed", "none", false)).toBe("confirmed");
    expect(resolveEstadoUi("fulfilled", "confirmed", "none", false)).toBe("confirmed");
    expect(resolveEstadoUi("paid", "expired", "none", false)).toBe("paid_no_hold");
  });

  it("cancelado → failed; reembolsado → refunded", () => {
    expect(resolveEstadoUi("cancelled", "cancelled", "approved", false)).toBe("failed");
    expect(resolveEstadoUi("refunded", "cancelled", "none", false)).toBe("refunded");
  });

  it("pendiente con pista approved vigente → confirming (aunque el hold venza)", () => {
    expect(resolveEstadoUi("pending_payment", "held", "approved", false)).toBe("confirming");
    expect(resolveEstadoUi("pending_payment", "expired", "approved", false)).toBe("confirming");
  });

  it("pendiente sin pista (o pista caducada): hold vencido → expired; si no → pending_payment", () => {
    expect(resolveEstadoUi("pending_payment", "expired", "none", false)).toBe("expired");
    expect(resolveEstadoUi("pending_payment", "held", "approved", true)).toBe("pending_payment");
    expect(resolveEstadoUi("pending_payment", "held", "none", false)).toBe("pending_payment");
  });
});

describe("isFreshPurchase (cuándo /reserva/estado manda purchase)", () => {
  const base = { status: "paid" as const, initialStatus: "pending_payment" as const, checkoutStartedHere: false, alreadyTracked: false };

  it("cuenta el paso observado de pendiente a pagado", () => {
    expect(isFreshPurchase(base)).toBe(true);
  });

  it("llegó ya pagado: cuenta solo si el checkout empezó en este navegador (MP rápido o 100 % Beatcoins)", () => {
    expect(isFreshPurchase({ ...base, initialStatus: "paid", checkoutStartedHere: true })).toBe(true);
    expect(isFreshPurchase({ ...base, initialStatus: "paid" })).toBe(false); // visita de vuelta / otro dispositivo
  });

  it("nunca dos veces, y nunca sin estar pagado", () => {
    expect(isFreshPurchase({ ...base, alreadyTracked: true })).toBe(false);
    expect(isFreshPurchase({ ...base, status: "pending_payment" })).toBe(false);
    expect(isFreshPurchase({ ...base, status: "fulfilled" })).toBe(true);
  });
});
