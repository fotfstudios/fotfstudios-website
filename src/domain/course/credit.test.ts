import { describe, expect, it } from "vitest";
import { canExtendCredit, creditDiscount, creditExpiryFrom, isCreditApplicable, TRIAL_CREDIT_DAYS, trialCreditState } from "./credit";

const credit = (over: Partial<Parameters<typeof isCreditApplicable>[0]> = {}) => ({
  id: "c1",
  email: "cami@correo.cl",
  amountClp: 19990,
  expiresAt: "2026-09-10T00:00:00.000Z",
  consumedOrderId: null,
  ...over,
});

describe("creditExpiryFrom — la ventana corre desde la SESIÓN", () => {
  it("vence 7 días después del inicio de la prueba", () => {
    expect(creditExpiryFrom("2026-09-01T20:00:00.000Z")).toBe("2026-09-08T20:00:00.000Z");
  });

  it("TRIAL_CREDIT_DAYS es lo que dicen los términos", () => {
    expect(TRIAL_CREDIT_DAYS).toBe(7);
  });

  it("una fecha inválida se rechaza en vez de producir un vencimiento basura", () => {
    expect(() => creditExpiryFrom("no-es-fecha")).toThrow(/curso_credito_fecha_invalida/);
  });
});

describe("isCreditApplicable", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("dentro de la ventana y del mismo email: aplica", () => {
    expect(isCreditApplicable(credit(), "cami@correo.cl", now)).toBe(true);
  });

  it("el email compara sin distinguir mayúsculas", () => {
    expect(isCreditApplicable(credit(), "Cami@Correo.CL", now)).toBe(true);
  });

  it("de otra persona: no aplica", () => {
    expect(isCreditApplicable(credit(), "otra@correo.cl", now)).toBe(false);
  });

  it("vencido: no aplica", () => {
    expect(isCreditApplicable(credit(), "cami@correo.cl", new Date("2026-09-11T00:00:00.000Z"))).toBe(false);
  });

  it("ya consumido: no aplica", () => {
    expect(isCreditApplicable(credit({ consumedOrderId: "o1" }), "cami@correo.cl", now)).toBe(false);
  });

  // Los términos no ponen borde inferior: inscribirse antes de la prueba acredita.
  it("inscribirse ANTES de la sesión de prueba también acredita", () => {
    const antes = new Date("2026-09-02T00:00:00.000Z");
    expect(isCreditApplicable(credit(), "cami@correo.cl", antes)).toBe(true);
  });
});

describe("creditDiscount", () => {
  it("descuenta el monto del crédito", () => {
    expect(creditDiscount(credit(), 139990)).toBe(19990);
  });

  // Un crédito no puede dejar el pedido en negativo ni volverse un pago al alumno.
  it("nunca supera el total del pedido", () => {
    expect(creditDiscount(credit({ amountClp: 50000 }), 19990)).toBe(19990);
  });
});

describe("trialCreditState", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const base = { consumedOrderId: null, voidedAt: null, expiresAt: "2026-10-12T19:00:00Z" };
  it("vigente / vencido por fecha; usado y anulado ganan", () => {
    expect(trialCreditState(base, now)).toBe("vigente");
    expect(trialCreditState({ ...base, expiresAt: "2026-10-01T00:00:00Z" }, now)).toBe("vencido");
    expect(trialCreditState({ ...base, consumedOrderId: "o1" }, now)).toBe("usado");
    expect(trialCreditState({ ...base, voidedAt: "2026-10-07T00:00:00Z" }, now)).toBe("anulado");
  });
  it("se extiende lo vigente y lo vencido, no lo usado ni lo anulado", () => {
    expect(["vigente", "vencido", "usado", "anulado"].map((s) => canExtendCredit(s as never))).toEqual([true, true, false, false]);
  });
});
