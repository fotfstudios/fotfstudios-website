import { describe, expect, it } from "vitest";
import { toRefundInfo } from "./mercadopago-gateway";

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
