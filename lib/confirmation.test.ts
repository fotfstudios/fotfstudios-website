import { describe, expect, it } from "vitest";
import {
  buildConfirmationView,
  checkoutResumeUrl,
  durationLabel,
  firstNameOf,
  isUpcoming,
} from "./confirmation";
import type { OrderConfirmation } from "@/src/application/ports/orders";

const MODEL: OrderConfirmation = {
  orderId: "abc123",
  orderStatus: "paid",
  customerName: "Ana María Pérez Soto",
  startsAt: "2026-07-09T18:00:00-04:00",
  endsAt: "2026-07-09T20:00:00-04:00",
  resourceName: "Sala",
  reservationStatus: "confirmed",
  preferenceId: "3497260371-abcd-ef01",
  lines: [
    { description: "Sala · 2h (valle)", subtotal: 19990 },
    { description: "Sesión guiada · 1h", subtotal: 9990 },
  ],
  total: 29980,
  currency: "CLP",
};

describe("firstNameOf", () => {
  it("toma el primer nombre de un nombre compuesto", () => {
    expect(firstNameOf("Ana María Pérez Soto")).toBe("Ana");
  });
  it("nombre único pasa tal cual", () => {
    expect(firstNameOf("Benja")).toBe("Benja");
  });
  it("vacío, espacios o null → null", () => {
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe("durationLabel", () => {
  it("horas enteras → '2 h'", () => {
    expect(durationLabel("2026-07-09T18:00:00-04:00", "2026-07-09T20:00:00-04:00")).toBe("2 h");
  });
  it("fraccional → coma es-CL: '1,5 h'", () => {
    expect(durationLabel("2026-07-09T18:00:00-04:00", "2026-07-09T19:30:00-04:00")).toBe("1,5 h");
  });
});

describe("checkoutResumeUrl", () => {
  it("arma el init_point canónico desde el preference id", () => {
    expect(checkoutResumeUrl("3497260371-abcd-ef01")).toBe(
      "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=3497260371-abcd-ef01",
    );
  });
  it("sin preference → null", () => {
    expect(checkoutResumeUrl(null)).toBeNull();
  });
});

describe("isUpcoming", () => {
  const now = new Date("2026-07-09T19:00:00-04:00");
  it("sesión que aún no termina → true", () => {
    expect(isUpcoming("2026-07-09T20:00:00-04:00", now)).toBe(true);
  });
  it("sesión ya terminada → false", () => {
    expect(isUpcoming("2026-07-09T18:00:00-04:00", now)).toBe(false);
  });
  it("sin fecha → false", () => {
    expect(isUpcoming(null, now)).toBe(false);
  });
});

describe("buildConfirmationView", () => {
  it("formatea `when` igual que el email (es, America/Santiago)", () => {
    const v = buildConfirmationView(MODEL);
    // 2026-07-09 18:00 -04:00 = 18:00 hora de Santiago (invierno).
    expect(v.when).toBe("jueves 9 de julio, 18:00 h");
  });

  it("arma timeRange, duración, sala y montos CLP", () => {
    const v = buildConfirmationView(MODEL);
    expect(v.timeRange).toBe("18:00–20:00");
    expect(v.durationLabel).toBe("2 h");
    expect(v.resourceName).toBe("Sala");
    expect(v.firstName).toBe("Ana");
    expect(v.lines).toEqual([
      { description: "Sala · 2h (valle)", amount: "$19.990" },
      { description: "Sesión guiada · 1h", amount: "$9.990" },
    ]);
    expect(v.total).toBe("$29.980");
    expect(v.startsAt).toBe(MODEL.startsAt);
    expect(v.endsAt).toBe(MODEL.endsAt);
    expect(v.reservationStatus).toBe("confirmed");
    expect(v.resumeUrl).toBe("https://www.mercadopago.cl/checkout/v1/redirect?pref_id=3497260371-abcd-ef01");
  });

  it("orden sin reserva → campos de fecha null, recibo sigue completo", () => {
    const v = buildConfirmationView({
      ...MODEL,
      startsAt: null,
      endsAt: null,
      resourceName: null,
      reservationStatus: null,
    });
    expect(v.when).toBeNull();
    expect(v.timeRange).toBeNull();
    expect(v.durationLabel).toBeNull();
    expect(v.resourceName).toBeNull();
    expect(v.startsAt).toBeNull();
    expect(v.total).toBe("$29.980");
    expect(v.lines).toHaveLength(2);
  });
});
