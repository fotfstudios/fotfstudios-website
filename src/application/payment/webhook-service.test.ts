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

  it("reembolsos frescos → refunded con la suma; duplicados (loopback admin) → sin refunded", async () => {
    const repo = makeRepo();
    const svc = new WebhookService(
      makeGateway({
        status: "approved",
        externalReference: "o1",
        refunds: [
          { id: "ref_a", amount: 5000, status: "approved" },
          { id: "ref_b", amount: 2000, status: "approved" },
        ],
      }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(res.result).toBe("refunded");
    expect(res.refundedAmount).toBe(7000);
    expect(repo.markRefunded).toHaveBeenCalledTimes(2);

    // Loopback: mismos refunds ya en el inbox → ni asiento ni result refunded.
    const repo2 = makeRepo({ recordEvent: vi.fn(async () => false) });
    const svc2 = new WebhookService(
      makeGateway({
        status: "approved",
        externalReference: "o1",
        refunds: [{ id: "ref_a", amount: 5000, status: "approved" }],
      }),
      repo2,
    );
    const res2 = await svc2.handlePaymentNotification("pay1");
    expect(res2.result).not.toBe("refunded");
    expect(repo2.markRefunded).not.toHaveBeenCalled();
  });

  it("evento repetido → duplicate (inbox)", async () => {
    const repo = makeRepo({ recordEvent: vi.fn(async () => false) });
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "o1" }), repo);
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
    expect(repo.confirmPaid).not.toHaveBeenCalled();
  });
});
