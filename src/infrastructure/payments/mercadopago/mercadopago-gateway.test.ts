import { describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway, toRefundInfo } from "./mercadopago-gateway";

/**
 * El adaptador es glue delgado sobre el SDK (se ejercita en el .itest sandbox);
 * su única lógica propia es el MAPEO de la forma cruda de MP a PaymentRefundInfo.
 * `getPayment`, `listRefunds` y `getRefund` comparten este mapper.
 */
describe("toRefundInfo", () => {
  it("mapea un reembolso crudo de MP a PaymentRefundInfo", () => {
    expect(
      toRefundInfo({ id: 123, amount: 9990, status: "approved", date_created: "2026-07-07T10:00:00Z" }),
    ).toEqual({ id: "123", amount: 9990, status: "approved", dateCreated: "2026-07-07T10:00:00Z" });
  });

  it("aplica defaults: amount→0, status→'unknown', dateCreated→undefined; id se stringifica", () => {
    expect(toRefundInfo({ id: 456 })).toEqual({
      id: "456",
      amount: 0,
      status: "unknown",
      dateCreated: undefined,
    });
  });
});

// El SDK es la frontera: se mockea solo PaymentRefund para ver qué clave viaja a MP.
const refundCreate = vi.fn(async () => ({ id: 777, status: "approved", amount: 5000 }));
vi.mock("mercadopago", async (importOriginal) => {
  const mod = await importOriginal<typeof import("mercadopago")>();
  return {
    ...mod,
    PaymentRefund: class {
      create = refundCreate;
      total = vi.fn(async () => ({ id: 778, status: "approved" }));
    },
  };
});

describe("MercadoPagoGateway.refundPayment — clave de idempotencia", () => {
  it("usa la clave del llamador cuando viene", async () => {
    const gw = new MercadoPagoGateway("APP_USR-test");
    await gw.refundPayment("123", 5000, "refund:123:5000:9990");
    expect(refundCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ payment_id: "123", body: { amount: 5000 }, requestOptions: { idempotencyKey: "refund:123:5000:9990" } }),
    );
  });

  it("sin clave del llamador, conserva la clave por pago+monto", async () => {
    const gw = new MercadoPagoGateway("APP_USR-test");
    await gw.refundPayment("123", 5000);
    expect(refundCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestOptions: { idempotencyKey: "refund:123:5000" } }),
    );
  });
});
