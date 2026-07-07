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

function makeFinalizer(over = {}) {
  return {
    pendingChargeForOrder: vi.fn(async () => ({ deltaOrderId: "do1", rescheduleId: "rs1" })),
    applyCharge: vi.fn(async () => "applied" as const),
    markChargeRefunded: vi.fn(async () => {}),
    ...over,
  };
}

describe("WebhookService — cobro de reagendamiento diferido", () => {
  it("orden de delta pagada + slot libre → reschedule_applied (sin confirm normal)", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer();
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "do1", amount: 3000 }), repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res).toEqual({ result: "reschedule_applied", orderId: "do1" });
    expect(fin.applyCharge).toHaveBeenCalledWith("do1", "payd");
    expect(repo.confirmPaid).not.toHaveBeenCalled(); // NO confirm normal para la orden de delta
  });

  it("slot tomado al pagar → devuelve el excedente y marca refund → reschedule_slot_taken", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ applyCharge: vi.fn(async () => "slot_taken" as const) });
    const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
    (gw.refundPayment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ref_slot", status: "approved" });
    const svc = new WebhookService(gw, repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res).toEqual({ result: "reschedule_slot_taken", orderId: "do1" });
    expect(gw.refundPayment).toHaveBeenCalledWith("payd");
    expect(fin.markChargeRefunded).toHaveBeenCalledWith("do1", "ref_slot");
  });

  it("segunda entrega (inbox duplicado) → duplicate, sin re-finalizar", async () => {
    const repo = makeRepo({ recordEvent: vi.fn(async () => false) });
    const fin = makeFinalizer();
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "do1" }), repo, fin);
    expect((await svc.handlePaymentNotification("payd")).result).toBe("duplicate");
    expect(fin.applyCharge).not.toHaveBeenCalled();
  });

  it("orden normal (no es cobro de reagendamiento) → confirm normal", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ pendingChargeForOrder: vi.fn(async () => null) });
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "o1", amount: 9990 }), repo, fin);
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("paid");
    expect(fin.applyCharge).not.toHaveBeenCalled();
    expect(repo.confirmPaid).toHaveBeenCalled();
  });
});
