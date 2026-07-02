import { describe, expect, it, vi } from "vitest";
import { RefundService, type RefundBookingRepo } from "./refund-service";
import type { PaymentGateway } from "@/src/application/ports/payment";

function makeGateway(over: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    createPreference: vi.fn(),
    getPayment: vi.fn(),
    findPaymentByOrder: vi.fn(),
    refundPayment: vi.fn(async () => ({ id: "ref_1", status: "approved", amount: 9990 })),
    ...over,
  } as PaymentGateway;
}

type Target = Awaited<ReturnType<RefundBookingRepo["orderForReservation"]>>;
function makeRepo(target: Target): RefundBookingRepo {
  return {
    orderForReservation: vi.fn(async () => target),
    cancelBooking: vi.fn(async () => {}),
  };
}

describe("RefundService.cancelBooking", () => {
  it("refund + pago MP real → reembolsa en MP y cancela con el refund id", async () => {
    const gw = makeGateway();
    const repo = makeRepo({ orderId: "o1", status: "paid", mpPaymentId: "1234567890" });
    await new RefundService(gw, repo).cancelBooking("r1", { refund: true });
    expect(gw.refundPayment).toHaveBeenCalledWith("1234567890");
    expect(repo.cancelBooking).toHaveBeenCalledWith("r1", "ref_1");
  });

  it("refund pero MP falla → aborta: no cancela nada", async () => {
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        throw new Error("MP 500");
      }),
    });
    const repo = makeRepo({ orderId: "o1", status: "paid", mpPaymentId: "1234567890" });
    await expect(new RefundService(gw, repo).cancelBooking("r1", { refund: true })).rejects.toThrow("MP 500");
    expect(repo.cancelBooking).not.toHaveBeenCalled();
  });

  it("sin reembolso → cancela sin llamar a MP", async () => {
    const gw = makeGateway();
    const repo = makeRepo({ orderId: "o1", status: "paid", mpPaymentId: "1234567890" });
    await new RefundService(gw, repo).cancelBooking("r1", { refund: false });
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(repo.cancelBooking).toHaveBeenCalledWith("r1", null);
  });

  it("pago offline → no llama a MP pero registra la NC (offline:manual)", async () => {
    const gw = makeGateway();
    const repo = makeRepo({ orderId: "o1", status: "paid", mpPaymentId: "offline:efectivo" });
    await new RefundService(gw, repo).cancelBooking("r1", { refund: true });
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(repo.cancelBooking).toHaveBeenCalledWith("r1", "offline:manual");
  });

  it("reserva no pagada → cancela sin reembolso (sin MP)", async () => {
    const gw = makeGateway();
    const repo = makeRepo({ orderId: "o1", status: "pending_payment", mpPaymentId: null });
    await new RefundService(gw, repo).cancelBooking("r1", { refund: true });
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(repo.cancelBooking).toHaveBeenCalledWith("r1", null);
  });
});
