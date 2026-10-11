import { describe, expect, it } from "vitest";
import { ctaLabel, missingItem, stepsCompleted, type BookingStepState } from "./booking-steps";

const DONE: BookingStepState = {
  hasSlot: true,
  name: "Nico Rivas",
  email: "nico@correo.cl",
  phone: "9 6280 3298",
  termsAccepted: true,
};

describe("missingItem", () => {
  it("null con todo completo", () => {
    expect(missingItem(DONE)).toBeNull();
  });

  it("en orden: horario → email → nombre → celular → términos", () => {
    expect(missingItem({ ...DONE, hasSlot: false, name: "" })).toEqual({
      step: "horario",
      anchorId: "bk-schedule",
      label: "Selecciona un horario",
    });
    expect(missingItem({ ...DONE, name: "  ", email: "" })?.anchorId).toBe("bk-email");
    expect(missingItem({ ...DONE, email: "nico@" })).toMatchObject({ step: "datos", label: "Ingresa tu email" });
    expect(missingItem({ ...DONE, name: "  " })).toMatchObject({ anchorId: "bk-name", label: "Ingresa tu nombre" });
    expect(missingItem({ ...DONE, phone: "9 1234" })).toMatchObject({ anchorId: "bk-phone", label: "Ingresa tu celular" });
    expect(missingItem({ ...DONE, termsAccepted: false })).toMatchObject({ step: "pago", anchorId: "bk-terms" });
  });
});

describe("stepsCompleted", () => {
  it("cuenta los pasos completos desde el primero", () => {
    expect(stepsCompleted({ ...DONE, hasSlot: false })).toBe(0);
    expect(stepsCompleted({ ...DONE, phone: "" })).toBe(1);
    expect(stepsCompleted({ ...DONE, termsAccepted: false })).toBe(2);
    expect(stepsCompleted(DONE)).toBe(3);
  });
});

describe("ctaLabel", () => {
  const base = { state: DONE, tried: false, submitting: false, fullPoints: false, payable: 24000 };

  it("Ir a pagar con el monto; sin horario, sin monto", () => {
    expect(ctaLabel(base)).toBe("Ir a pagar $24.000");
    expect(ctaLabel({ ...base, state: { ...DONE, hasSlot: false }, payable: null })).toBe("Ir a pagar");
  });

  it("tras un intento nombra lo que falta", () => {
    expect(ctaLabel({ ...base, tried: true, state: { ...DONE, phone: "" } })).toBe("Ingresa tu celular");
    expect(ctaLabel({ ...base, tried: false, state: { ...DONE, phone: "" } })).toBe("Ir a pagar $24.000");
  });

  it("acepta un faltante calculado afuera (p. ej. un dato a medio editar)", () => {
    const pending = { step: "datos" as const, anchorId: "bk-name", label: "Guarda tus cambios" };
    expect(ctaLabel({ ...base, tried: true, missing: pending })).toBe("Guarda tus cambios");
    expect(ctaLabel({ ...base, tried: false, missing: pending })).toBe("Ir a pagar $24.000");
  });

  it("Beatcoins al 100 % y estado de envío", () => {
    expect(ctaLabel({ ...base, fullPoints: true, payable: 0 })).toBe("Pagar con Beatcoins");
    expect(ctaLabel({ ...base, submitting: true })).toBe("Redirigiendo…");
    expect(ctaLabel({ ...base, submitting: true, fullPoints: true })).toBe("Confirmando…");
  });
});
