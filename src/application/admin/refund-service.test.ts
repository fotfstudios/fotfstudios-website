import { describe, expect, it, vi } from "vitest";
import { RefundService, type RefundBookingRepo, type RefundInbox } from "./refund-service";
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
function makeRepo(target: Target, backing?: { liveAmount: number; paymentId: string | null }[]): RefundBookingRepo {
  // Por defecto: una boleta viva financiada por el pago del pedido (caso común, un pago).
  const boletas =
    backing ?? (target && target.amountClp > 0 ? [{ liveAmount: target.amountClp - target.refundedAmountClp, paymentId: target.mpPaymentId }] : []);
  return {
    orderForReservation: vi.fn(async () => target),
    backingBoletas: vi.fn(async () => boletas),
    cancelBooking: vi.fn(async () => {}),
    refundPointsOrder: vi.fn(async () => {}),
  };
}

function makeInbox(over: Partial<RefundInbox> = {}): RefundInbox {
  return {
    recordEvent: vi.fn(async () => true),
    markRefunded: vi.fn(async () => {}),
    ...over,
  };
}

const PAID: Target = {
  orderId: "o1",
  status: "paid",
  mpPaymentId: "1234567890",
  amountClp: 19990,
  refundedAmountClp: 0,
  pointsRedeemedClp: 0,
  startsAt: "2026-07-09T18:00:00-04:00",
};

const POINTS_PAID: Target = {
  orderId: "o2",
  status: "paid",
  mpPaymentId: "offline:puntos",
  amountClp: 0,
  refundedAmountClp: 0,
  pointsRedeemedClp: 19990,
  startsAt: "2026-07-09T18:00:00-04:00",
};

describe("RefundService.cancelBooking", () => {
  it("reembolso MP: monto explícito → inbox PRIMERO → mark_refunded (sin cancel_booking)", async () => {
    const gw = makeGateway();
    const repo = makeRepo(PAID);
    const inbox = makeInbox();
    const calls: string[] = [];
    (inbox.recordEvent as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push("recordEvent");
      return true;
    });
    (inbox.markRefunded as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls.push("markRefunded");
    });

    const res = await new RefundService(gw, repo, inbox).cancelBooking("r1", { refundAmount: 9990 });

    expect(gw.refundPayment).toHaveBeenCalledWith("1234567890", 9990);
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_1", "refund", expect.anything());
    expect(inbox.markRefunded).toHaveBeenCalledWith("o1", "ref_1", 9990);
    expect(calls).toEqual(["recordEvent", "markRefunded"]); // orden inbox→asiento (anti NC duplicada)
    expect(repo.cancelBooking).not.toHaveBeenCalled(); // mark_refunded ya cancela la reserva
    expect(res.alreadyProcessed).toBe(false);
  });

  it("reembolso multi-pago (encarecido antes) → reparte por-pago, cada uno contra su pago", async () => {
    // amount 12990 = original 9990 @orig + delta 3000 @delta; cancelar total.
    const gw = makeGateway({ refundPayment: vi.fn(async (pid: string, amt: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })) });
    const repo = makeRepo({ ...PAID, mpPaymentId: "orig", amountClp: 12990 }, [
      { liveAmount: 9990, paymentId: "orig" },
      { liveAmount: 3000, paymentId: "delta" },
    ]);
    const inbox = makeInbox();
    const res = await new RefundService(gw, repo, inbox).cancelBooking("r1", { refundAmount: 12990 });
    expect(gw.refundPayment).toHaveBeenCalledWith("orig", 9990);
    expect(gw.refundPayment).toHaveBeenCalledWith("delta", 3000);
    expect(gw.refundPayment).toHaveBeenCalledTimes(2);
    expect(inbox.markRefunded).toHaveBeenCalledWith("o1", "ref_orig", 12990);
    expect(res.alreadyProcessed).toBe(false);
  });

  it("orden 100% puntos: repone vía refund_points_order — sin MP, sin inbox, sin NC", async () => {
    const gw = makeGateway();
    const repo = makeRepo(POINTS_PAID);
    const inbox = makeInbox();

    const res = await new RefundService(gw, repo, inbox).cancelBooking("r1", { refundAmount: 9995 });

    expect(repo.refundPointsOrder).toHaveBeenCalledWith("o2", 9995);
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(inbox.markRefunded).not.toHaveBeenCalled();
    expect(res.alreadyProcessed).toBe(false);
  });

  it("orden 100% puntos: reponer más que lo canjeado → error sin tocar nada", async () => {
    const repo = makeRepo(POINTS_PAID);

    await expect(
      new RefundService(makeGateway(), repo, makeInbox()).cancelBooking("r1", { refundAmount: 20000 }),
    ).rejects.toThrow(/puntos/);
    expect(repo.refundPointsOrder).not.toHaveBeenCalled();
  });

  it("inbox duplicado (loopback ganó) → NO asienta y devuelve alreadyProcessed", async () => {
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const res = await new RefundService(makeGateway(), makeRepo(PAID), inbox).cancelBooking("r1", {
      refundAmount: 19990,
    });
    expect(inbox.markRefunded).not.toHaveBeenCalled();
    expect(res.alreadyProcessed).toBe(true);
  });

  it("MP falla → aborta: inbox y DB intactos", async () => {
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        throw new Error("MP 500");
      }),
    });
    const inbox = makeInbox();
    const repo = makeRepo(PAID);
    await expect(
      new RefundService(gw, repo, inbox).cancelBooking("r1", { refundAmount: 9990 }),
    ).rejects.toThrow("MP 500");
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(inbox.markRefunded).not.toHaveBeenCalled();
    expect(repo.cancelBooking).not.toHaveBeenCalled();
  });

  it("reembolso sobre orden NO pagada → error explícito (antes era silencioso)", async () => {
    const svc = new RefundService(makeGateway(), makeRepo({ ...PAID, status: "pending_payment" }), makeInbox());
    await expect(svc.cancelBooking("r1", { refundAmount: 9990 })).rejects.toThrow(/no está pagado/);
  });

  it("monto sobre el saldo reembolsable → error", async () => {
    const svc = new RefundService(
      makeGateway(),
      makeRepo({ ...PAID, refundedAmountClp: 15000 }), // saldo vivo: 4990
      makeInbox(),
    );
    await expect(svc.cancelBooking("r1", { refundAmount: 5000 })).rejects.toThrow(/saldo/);
  });

  it("pago offline → sin MP y SIN inbox; asiento directo con offline:manual", async () => {
    const gw = makeGateway();
    const inbox = makeInbox();
    const res = await new RefundService(gw, makeRepo({ ...PAID, mpPaymentId: "offline:efectivo" }), inbox).cancelBooking(
      "r1",
      { refundAmount: 9990 },
    );
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).not.toHaveBeenCalled(); // clave no única; no hay loopback
    expect(inbox.markRefunded).toHaveBeenCalledWith("o1", "offline:manual", 9990);
    expect(res.alreadyProcessed).toBe(false);
  });

  it("sin reembolso (null) → cancelación simple, sin MP ni inbox", async () => {
    const gw = makeGateway();
    const repo = makeRepo(PAID);
    const inbox = makeInbox();
    await new RefundService(gw, repo, inbox).cancelBooking("r1", { refundAmount: null });
    expect(repo.cancelBooking).toHaveBeenCalledWith("r1");
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.markRefunded).not.toHaveBeenCalled();
  });

  it("bloqueo/cortesía (sin orden) + reembolso pedido → error claro", async () => {
    const svc = new RefundService(makeGateway(), makeRepo(null), makeInbox());
    await expect(svc.cancelBooking("r1", { refundAmount: 5000 })).rejects.toThrow(/pago asociado/);
  });
});
