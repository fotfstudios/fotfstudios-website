import { describe, expect, it, vi } from "vitest";
import { WebhookService } from "./webhook-service";
import type { PaymentGateway, PaymentInfo } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

function makeGateway(info: Partial<PaymentInfo>): PaymentGateway {
  return {
    createPreference: vi.fn(),
    getPayment: vi.fn(async () => ({ id: "pay1", status: "approved", ...info }) as PaymentInfo),
    findPaymentByOrder: vi.fn(),
    refundPayment: vi.fn(),
  } as unknown as PaymentGateway;
}

function makeRepo(over: Partial<PaymentNotificationRepository> = {}): PaymentNotificationRepository {
  return {
    recordEvent: vi.fn(async () => true),
    getOrderAmount: vi.fn(async () => 9990),
    confirmPaid: vi.fn(async () => "confirmed" as const),
    markRefunded: vi.fn(async () => {}),
    ...over,
  };
}

describe("WebhookService.handlePaymentNotification", () => {
  it("rejected → NO toca el pedido (Checkout Pro reintenta; el hold es la limpieza)", async () => {
    const repo = makeRepo();
    const svc = new WebhookService(makeGateway({ status: "rejected", externalReference: "o1" }), repo);
    const res = await svc.handlePaymentNotification("pay1");
    expect(res).toEqual({ result: "rejected", orderId: "o1" });
    expect(repo.confirmPaid).not.toHaveBeenCalled();
    expect(repo.markRefunded).not.toHaveBeenCalled();
    // El evento sí queda en el inbox (idempotencia/observabilidad).
    expect(repo.recordEvent).toHaveBeenCalledWith("pay1:rejected", "payment", expect.anything());
  });

  it("approved → confirma el pedido", async () => {
    const repo = makeRepo();
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o1", amount: 9990 }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(res).toEqual({ result: "paid", orderId: "o1" });
    expect(repo.confirmPaid).toHaveBeenCalled();
  });

  it("approved con monto distinto al pedido → ignored (no confirma)", async () => {
    const repo = makeRepo({ getOrderAmount: vi.fn(async () => 19990) });
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o1", amount: 9990 }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(res).toEqual({ result: "ignored", orderId: "o1" });
    expect(repo.confirmPaid).not.toHaveBeenCalled();
  });

  it("evento repetido → duplicate (inbox)", async () => {
    const repo = makeRepo({ recordEvent: vi.fn(async () => false) });
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "o1" }), repo);
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
    expect(repo.confirmPaid).not.toHaveBeenCalled();
  });
});
