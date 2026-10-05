import { describe, expect, it } from "vitest";
import { paymentBadge, type PaymentBadgeInput } from "./payment-badge";

const NOW = new Date("2026-10-06T15:00:00Z");
const base: PaymentBadgeInput = {
  kind: "booking",
  status: "confirmed",
  startsAt: "2026-10-12T19:00:00Z",
  orderId: "o1",
  orderStatus: "paid",
  paymentMethod: "transferencia",
  expiresAt: null,
  paymentClockStart: "2026-10-06T14:00:00Z",
  rescheduleId: null,
  practiceEnrollmentId: null,
};

describe("paymentBadge — la columna Pago de /admin/reservas", () => {
  it.each([
    ["transferencia", "Pagada · Transferencia"],
    ["efectivo", "Pagada · Efectivo"],
    ["mercadopago", "Pagada · Mercado Pago"],
    ["puntos", "Pagada · Puntos FOTF"],
    [null, "Pagada"],
  ])("pagada por %s → %s", (paymentMethod, label) => {
    expect(paymentBadge({ ...base, paymentMethod }, NOW)).toEqual({ label, tone: "ok" });
  });

  it("pendiente manual (hold firme): dice hasta cuándo pagar — el barrido después de las 72 h", () => {
    const b = paymentBadge({ ...base, status: "held", orderStatus: "pending_payment", paymentMethod: null }, NOW);
    expect(b).toEqual({ label: "Pago pendiente", tone: "pending", dueAt: "2026-10-10T12:00:00.000Z" });
  });

  it("pendiente manual con la sesión antes del barrido: vence al inicio de la sesión", () => {
    const b = paymentBadge(
      { ...base, status: "held", orderStatus: "pending_payment", startsAt: "2026-10-07T19:00:00Z" },
      NOW,
    );
    expect(b?.dueAt).toBe("2026-10-07T19:00:00.000Z");
  });

  it("pendiente con la sesión ya empezada → Pago vencido (alerta)", () => {
    const b = paymentBadge(
      { ...base, status: "held", orderStatus: "pending_payment", startsAt: "2026-10-06T14:30:00Z" },
      NOW,
    );
    expect(b).toEqual({ label: "Pago vencido", tone: "alert" });
  });

  it("checkout web en curso (hold con vencimiento) no promete plazo", () => {
    const b = paymentBadge(
      { ...base, status: "held", orderStatus: "pending_payment", expiresAt: "2026-10-06T15:10:00Z" },
      NOW,
    );
    expect(b).toEqual({ label: "Pago en curso", tone: "pending" });
  });

  it("reembolsada / pendiente cancelada", () => {
    expect(paymentBadge({ ...base, orderStatus: "refunded" }, NOW)?.label).toBe("Reembolsada");
    expect(
      paymentBadge({ ...base, status: "expired", orderStatus: "pending_payment" }, NOW)?.label,
    ).toBe("Sin pagar");
  });

  it("sin pedido: cortesía, práctica del curso o cupo de reagendamiento", () => {
    const sin = { ...base, orderId: null, orderStatus: null, paymentMethod: null };
    expect(paymentBadge(sin, NOW)?.label).toBe("Cortesía");
    expect(paymentBadge({ ...sin, practiceEnrollmentId: "e1" }, NOW)?.label).toBe("Práctica del curso");
    expect(paymentBadge({ ...sin, rescheduleId: "r1" }, NOW)?.label).toBe("Cupo de reagendamiento");
  });

  it("bloqueo y sesión guiada del curso no tienen cobro", () => {
    expect(paymentBadge({ ...base, kind: "block", orderId: null }, NOW)).toBeNull();
    expect(paymentBadge({ ...base, kind: "curso", orderId: null }, NOW)).toBeNull();
  });
});
