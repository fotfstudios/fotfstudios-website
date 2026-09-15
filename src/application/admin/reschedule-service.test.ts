import { describe, expect, it, vi } from "vitest";
import { RescheduleService } from "./reschedule-service";
import type {
  PendingRefundRow,
  ReschedulePort,
  RescheduleContext,
  RescheduleFinalizer,
  SettleOutcome,
} from "@/src/application/ports/reschedule";
import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PricingService } from "@/src/application/pricing/pricing-service";
import type { Quote } from "@/src/domain/pricing/types";
import { err, ok } from "@/src/domain/shared/result";

const NOW = new Date("2026-07-10T12:00:00Z");
const OLD_START = "2026-07-12T18:00:00Z"; // >12 h ⇒ política permite
const NEW_START = "2026-07-13T18:00:00Z";
const NEW_END = "2026-07-13T19:00:00Z";

function quoteOf(total: number): Quote {
  return {
    tierLines: [{ key: "valle", hours: 1, rate: total, subtotal: total }],
    addonLines: [],
    roomSubtotal: total,
    volumePct: 0,
    discount: 0,
    addonsTotal: 0,
    total,
    net: total,
    tax: 0,
    endMinute: 660,
  };
}

function makePricing(total: number): Pick<PricingService, "quoteBooking"> {
  return {
    quoteBooking: vi.fn(async () => ok({ quote: quoteOf(total), currency: "CLP", startsAt: NEW_START, endsAt: NEW_END })),
  };
}

type Gateway = Pick<PaymentGateway, "refundPayment" | "getRefund">;

function makeGateway(over: Partial<Gateway> = {}): Gateway {
  return {
    refundPayment: vi.fn(async () => ({ id: "ref_9", status: "approved", amount: 2000 })),
    getRefund: vi.fn(async () => null),
    ...over,
  };
}

/** Lo que el servicio necesita del repo: el puerto + el asiento del delta de un cobro fallido (H9). */
type Repo = ReschedulePort & Pick<RescheduleFinalizer, "markChargeRefunded">;

function makeRepo(ctx: RescheduleContext | null, backing?: { liveAmount: number; paymentId: string | null }[]): Repo {
  // Por defecto: una boleta viva financiada por el pago del pedido (caso común, un pago).
  const boletas =
    backing ?? (ctx?.order ? [{ liveAmount: ctx.order.amountClp - ctx.order.refundedAmountClp, paymentId: ctx.order.mpPaymentId }] : []);
  const repo: Repo = {
    loadContext: vi.fn(async () => ctx),
    moveEqual: vi.fn(async () => {}),
    moveDown: vi.fn(async () => ({ rescheduleId: "rs1" })),
    // La lectura tras mover devuelve el delta que ESE test usó (lo que moveDown recibió),
    // aunque el test haya reemplazado moveDown por su propio vi.fn.
    pendingRefundRow: vi.fn(async (): Promise<PendingRefundRow | null> => ({
      rescheduleId: "rs1",
      orderId: ctx?.order?.id ?? "o1",
      reservationId: "r1",
      deltaClp: vi.mocked(repo.moveDown).mock.calls.at(-1)?.[0].refundAmount ?? 0,
      settledClp: 0,
      inFlight: null,
    })),
    settleRefund: vi.fn(async (): Promise<SettleOutcome> => "applied"),
    markRefundInFlight: vi.fn(async () => {}),
    pendingRefundIds: vi.fn(async () => []),
    unrefundedFailedCharges: vi.fn(async () => []),
    createCharge: vi.fn(async () => ({ rescheduleId: "rs1", deltaOrderId: "do1" })),
    moveCourtesy: vi.fn(async () => {}),
    backingBoletas: vi.fn(async () => boletas),
    cancelCharge: vi.fn(async () => true),
    markChargeRefunded: vi.fn(async () => {}),
  };
  return repo;
}

function makeInbox(over = {}) {
  return { recordEvent: vi.fn(async () => true), markRefunded: vi.fn(async () => {}), ...over };
}

function makePayments() {
  return { createPreferenceForOrder: vi.fn(async () => ok({ preferenceId: "pref1", initPoint: "https://mp/x" })) };
}

const CTX: RescheduleContext = {
  reservation: { id: "r1", resourceId: "res1", startsAt: OLD_START, status: "confirmed", kind: "booking" },
  order: { id: "o1", status: "paid", amountClp: 9990, refundedAmountClp: 0, pointsRedeemedClp: 0, mpPaymentId: "mp_123" },
  addonKeys: [],
  concessionClp: 0,
  concessionLabel: "",
  timezone: "America/Santiago",
  pending: null,
};

const COURTESY: RescheduleContext = { ...CTX, order: null };

const input = { reservationId: "r1", date: "2026-07-13", startMinute: 1080, durationHours: 1, now: NOW };

function svc(o: {
  pricing?: Pick<PricingService, "quoteBooking">;
  gw?: Gateway;
  repo?: Repo;
  inbox?: ReturnType<typeof makeInbox>;
  payments?: ReturnType<typeof makePayments>;
} = {}) {
  const repo = o.repo ?? makeRepo(CTX);
  const inbox = o.inbox ?? makeInbox();
  const payments = o.payments ?? makePayments();
  const gw = o.gw ?? makeGateway();
  return {
    service: new RescheduleService(gw, (o.pricing ?? makePricing(9990)) as PricingService, repo, inbox, payments),
    repo,
    inbox,
    payments,
    gw,
  };
}

describe("RescheduleService.reschedule", () => {
  it("mismo precio → moveEqual, sin MP ni inbox", async () => {
    const { service, repo } = svc({ pricing: makePricing(9990) });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "moved" });
    expect(repo.moveEqual).toHaveBeenCalledOnce();
    expect(repo.moveDown).not.toHaveBeenCalled();
  });

  it("más barato con pago MP → moveDown PRIMERO → refundPayment(clave por fila) → inbox → settleRefund → refunded", async () => {
    const calls: string[] = [];
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.moveDown = vi.fn(async () => {
      calls.push("move");
      return { rescheduleId: "rs1" };
    });
    repo.settleRefund = vi.fn(async () => {
      calls.push("settle");
      return "applied" as const;
    });
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        calls.push("mp");
        return { id: "ref_9", status: "approved", amount: 2000 };
      }),
    });
    const inbox = makeInbox({
      recordEvent: vi.fn(async () => {
        calls.push("inbox");
        return true;
      }),
    });
    const { service } = svc({ pricing: makePricing(7990), gw, repo, inbox });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(calls).toEqual(["move", "mp", "inbox", "settle"]);
    expect(repo.moveDown).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "r1", refundAmount: 2000, createdBy: null }));
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000, "refund:mp_123:2000:rs1");
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_9", "refund", expect.anything());
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_9", 2000);
  });

  it("MP lanza tras mover → refund_pending(mp_error): sin inbox, sin settle, sin in-flight", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        throw new Error("MP down");
      }),
    });
    const { service, inbox } = svc({ pricing: makePricing(7990), gw, repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refund_pending", rescheduleId: "rs1", amount: 2000, reason: "mp_error" }));
    expect(repo.moveDown).toHaveBeenCalledOnce(); // la reserva SÍ se movió; solo la plata quedó pendiente
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(repo.settleRefund).not.toHaveBeenCalled();
    expect(repo.markRefundInFlight).not.toHaveBeenCalled();
  });

  it("MP responde in_process → guarda el id en vuelo y refund_pending(in_process); sin inbox ni settle", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    const gw = makeGateway({ refundPayment: vi.fn(async () => ({ id: "ref_ip", status: "in_process", amount: 2000 })) });
    const { service, inbox } = svc({ pricing: makePricing(7990), gw, repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refund_pending", rescheduleId: "rs1", amount: 2000, reason: "in_process" }));
    expect(repo.markRefundInFlight).toHaveBeenCalledWith("rs1", { paymentId: "mp_123", refundId: "ref_ip" });
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(repo.settleRefund).not.toHaveBeenCalled();
  });

  it("loopback ganó (inbox no fresco + settle duplicate) → refunded igual, sin error", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.settleRefund = vi.fn(async () => "duplicate" as const);
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_9", 2000);
    expect(inbox.markRefunded).not.toHaveBeenCalled();
  });

  it("settle noop (reserva cancelada entre medio) con inbox fresco → markRefunded una vez → refund_looped_back", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.settleRefund = vi.fn(async () => "noop" as const);
    const inbox = makeInbox({ recordEvent: vi.fn(async () => true), markRefunded: vi.fn(async () => {}) });
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refund_looped_back" }));
    expect(inbox.markRefunded).toHaveBeenCalledTimes(1);
    expect(inbox.markRefunded).toHaveBeenCalledWith("o1", "ref_9", 2000);
  });

  it("settle noop con inbox NO fresco → el loopback ya asentó: refund_looped_back sin markRefunded", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.settleRefund = vi.fn(async () => "noop" as const);
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refund_looped_back" }));
    expect(inbox.markRefunded).not.toHaveBeenCalled();
  });

  it("multi-pago: dos splits, claves por pago, settled → applied; si el primero queda in_process el segundo NO se intenta", async () => {
    // oldLive 12990 (original 9990 @mp_1 + delta 3000 @mp_2); abaratar a 1990 → refund 11000.
    const backing = [
      { liveAmount: 9990, paymentId: "mp_1" },
      { liveAmount: 3000, paymentId: "mp_2" },
    ];
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 12990 } }, backing);
    repo.settleRefund = vi
      .fn(async (): Promise<SettleOutcome> => "settled")
      .mockResolvedValueOnce("settled")
      .mockResolvedValueOnce("applied");
    const gw = makeGateway({
      refundPayment: vi.fn(async (pid: string, amt?: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })),
    });
    const { service } = svc({ pricing: makePricing(1990), gw, repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refunded", amount: 11000, offline: false }));
    // Cada pago recibe solo lo que capturó (MP rechaza sobre-reembolsos), más-antigua-primero.
    expect(vi.mocked(gw.refundPayment).mock.calls.map((c) => c[2])).toEqual(["refund:mp_1:9990:rs1", "refund:mp_2:1010:rs1"]);
    expect(repo.settleRefund).toHaveBeenNthCalledWith(1, "rs1", "ref_mp_1", 9990);
    expect(repo.settleRefund).toHaveBeenNthCalledWith(2, "rs1", "ref_mp_2", 1010);

    const gw2 = makeGateway({
      refundPayment: vi.fn(async (pid: string, amt?: number) => ({ id: `ref_${pid}`, status: "in_process", amount: amt })),
    });
    const repo2 = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 12990 } }, backing);
    const { service: s2 } = svc({ pricing: makePricing(1990), gw: gw2, repo: repo2 });
    expect(await s2.reschedule(input)).toEqual(ok({ kind: "refund_pending", rescheduleId: "rs1", amount: 11000, reason: "in_process" }));
    expect(gw2.refundPayment).toHaveBeenCalledTimes(1);
    expect(repo2.markRefundInFlight).toHaveBeenCalledWith("rs1", { paymentId: "mp_1", refundId: "ref_mp_1" });
  });

  it("más barato OFFLINE → moveDown + settleRefund(offline:reschedule), sin MP ni inbox", async () => {
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, mpPaymentId: "offline:efectivo" } }, [
      { liveAmount: 9990, paymentId: "offline:efectivo" },
    ]);
    const { service, inbox, gw } = svc({ pricing: makePricing(7990), repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refunded", amount: 2000, offline: true }));
    expect(repo.moveDown).toHaveBeenCalledOnce();
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "offline:reschedule", 2000);
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).not.toHaveBeenCalled();
  });

  it("mixto (original offline + delta MP): la porción offline se asienta EN ORDEN antes del reembolso MP", async () => {
    // Reserva pagada en efectivo (9990), encarecida después con un delta pagado en MP (3000);
    // ahora se abarata a 1990 → devolver 11000: 9990 los devuelve el dueño, 1010 salen de MP.
    const calls: string[] = [];
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 12990, mpPaymentId: "offline:efectivo" } }, [
      { liveAmount: 9990, paymentId: "offline:efectivo" },
      { liveAmount: 3000, paymentId: "mp_delta" },
    ]);
    repo.settleRefund = vi.fn(async (_id: string, refundId: string): Promise<SettleOutcome> => {
      calls.push(`settle:${refundId}`);
      return refundId === "offline:reschedule" ? "settled" : "applied";
    });
    const gw = makeGateway({
      refundPayment: vi.fn(async (pid: string, amt?: number) => {
        calls.push(`mp:${pid}`);
        return { id: `ref_${pid}`, status: "approved", amount: amt };
      }),
    });
    const { service, inbox } = svc({ pricing: makePricing(1990), gw, repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refunded", amount: 11000, offline: false }));
    expect(calls).toEqual(["settle:offline:reschedule", "mp:mp_delta", "settle:ref_mp_delta"]);
    expect(repo.settleRefund).toHaveBeenNthCalledWith(1, "rs1", "offline:reschedule", 9990);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_delta", 1010, "refund:mp_delta:1010:rs1");
    expect(repo.settleRefund).toHaveBeenNthCalledWith(2, "rs1", "ref_mp_delta", 1010);
    expect(inbox.recordEvent).toHaveBeenCalledTimes(1); // solo el reembolso MP pasa por el inbox
  });

  it("slot tomado en moveDown (lanza) → NO se toca MP", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.moveDown = vi.fn(async () => {
      throw new Error("Ese horario ya está tomado.");
    });
    const { service, gw } = svc({ pricing: makePricing(7990), repo });
    await expect(service.reschedule(input)).rejects.toThrow("Ese horario ya está tomado.");
    expect(gw.refundPayment).not.toHaveBeenCalled(); // I2: nada de plata si el movimiento aborta
    expect(repo.settleRefund).not.toHaveBeenCalled();
  });

  it("la fila desapareció justo tras mover (cancelada entre medio) → refund_looped_back sin tocar MP", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => null);
    const { service, gw } = svc({ pricing: makePricing(7990), repo });
    expect(await service.reschedule(input)).toEqual(ok({ kind: "refund_looped_back" }));
    expect(gw.refundPayment).not.toHaveBeenCalled();
  });

  it("más caro (charge) → cobro diferido (charge_pending) con el horario nuevo; NO mueve ni asienta", async () => {
    const { service, repo, payments } = svc({ pricing: makePricing(19990) });
    const res = await service.reschedule(input);
    expect(res).toEqual(
      ok({
        kind: "charge_pending",
        deltaOrderId: "do1",
        rescheduleId: "rs1",
        initPoint: "https://mp/x",
        amount: 10000,
        newStartsAt: NEW_START,
        newEndsAt: NEW_END,
      }),
    );
    expect(repo.createCharge).toHaveBeenCalledOnce();
    expect(payments.createPreferenceForOrder).toHaveBeenCalledWith("do1", { expiresInMinutes: 1440 });
    expect(repo.moveEqual).not.toHaveBeenCalled();
    expect(repo.moveDown).not.toHaveBeenCalled();
  });

  it("guardas: no pagada / reserva no confirmada / puntos / tarde", async () => {
    const guard = async (ctx: RescheduleContext, extra: Partial<typeof input> = {}, pricingTotal = 9990) => {
      const { service } = svc({ repo: makeRepo(ctx), pricing: makePricing(pricingTotal) });
      const res = await service.reschedule({ ...input, ...extra });
      return res.ok;
    };
    expect(await guard({ ...CTX, order: { ...CTX.order!, status: "pending_payment" } })).toBe(false); // no pagada
    expect(await guard({ ...CTX, reservation: { ...CTX.reservation, status: "cancelled" } })).toBe(false); // no activa
    expect(await guard({ ...CTX, order: { ...CTX.order!, pointsRedeemedClp: 5000 } })).toBe(false); // puntos
    expect(await guard({ ...CTX, reservation: { ...CTX.reservation, startsAt: "2026-07-10T18:00:00Z" } })).toBe(false); // <12h
  });

  it("con un cobro pendiente NO se cotiza ni se mueve → reschedule_pending", async () => {
    const pending = { kind: "charge" as const, rescheduleId: "rs0", deltaOrderId: "do0", amountClp: 3000, newStartsAt: NEW_START, newEndsAt: NEW_END };
    const { service, repo } = svc({ repo: makeRepo({ ...CTX, pending }) });
    expect(await service.reschedule(input)).toEqual(err("reschedule_pending"));
    expect(repo.moveEqual).not.toHaveBeenCalled();
    expect(repo.createCharge).not.toHaveBeenCalled();
  });

  it("con un reembolso pendiente tampoco se mueve → reschedule_pending", async () => {
    const pending = { kind: "refund" as const, rescheduleId: "rs0", deltaOrderId: null, amountClp: 2000, newStartsAt: NEW_START, newEndsAt: NEW_END };
    const { service, repo } = svc({ repo: makeRepo({ ...CTX, pending }), pricing: makePricing(7990) });
    expect(await service.reschedule(input)).toEqual(err("reschedule_pending"));
    expect(repo.moveDown).not.toHaveBeenCalled();
  });

  it("cortesía con fila pendiente también se bloquea", async () => {
    const pending = { kind: "charge" as const, rescheduleId: "rs0", deltaOrderId: "do0", amountClp: 0, newStartsAt: NEW_START, newEndsAt: NEW_END };
    const { service, repo } = svc({ repo: makeRepo({ ...COURTESY, pending }) });
    expect(await service.reschedule(input)).toEqual(err("reschedule_pending"));
    expect(repo.moveCourtesy).not.toHaveBeenCalled();
  });
});

describe("RescheduleService.retryRefund", () => {
  const row: PendingRefundRow = { rescheduleId: "rs1", orderId: "o1", reservationId: "r1", deltaClp: 2000, settledClp: 0, inFlight: null };

  it("sin in-flight → misma clave que el primer intento → inbox → settle → refunded", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => row);
    const { service, gw, inbox } = svc({ repo });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(gw.getRefund).not.toHaveBeenCalled();
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000, "refund:mp_123:2000:rs1");
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_9", "refund", expect.anything());
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_9", 2000);
    expect(repo.moveDown).not.toHaveBeenCalled(); // la reserva ya está movida
  });

  it("reintento tras un asiento parcial → solo reembolsa lo que falta", async () => {
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 12990 } }, [
      { liveAmount: 9990, paymentId: "mp_1" },
      { liveAmount: 3000, paymentId: "mp_2" },
    ]);
    repo.pendingRefundRow = vi.fn(async () => ({ ...row, deltaClp: 11000, settledClp: 9990 }));
    // La boleta de mp_1 ya se anuló en el asiento parcial: solo queda viva la de mp_2.
    repo.backingBoletas = vi.fn(async () => [{ liveAmount: 3000, paymentId: "mp_2" }]);
    const gw = makeGateway({ refundPayment: vi.fn(async (pid: string, amt?: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })) });
    const { service } = svc({ repo, gw });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 11000, offline: false }));
    expect(gw.refundPayment).toHaveBeenCalledTimes(1);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_2", 1010, "refund:mp_2:1010:rs1");
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_mp_2", 1010);
  });

  it("in-flight aprobado en MP → inbox + settle sin nuevo refundPayment", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => ({ ...row, inFlight: { paymentId: "mp_123", refundId: "ref_ip" } }));
    const gw = makeGateway({ getRefund: vi.fn(async () => ({ id: "ref_ip", status: "approved", amount: 2000 })) });
    const { service, inbox } = svc({ repo, gw });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(gw.getRefund).toHaveBeenCalledWith("mp_123", "ref_ip");
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_ip", "refund", expect.anything());
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_ip", 2000);
  });

  it("in-flight aprobado que solo cubre una parte → asienta y sigue con lo que falta", async () => {
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 12990 } });
    const partial: PendingRefundRow = { ...row, deltaClp: 11000, settledClp: 0, inFlight: { paymentId: "mp_1", refundId: "ref_ip" } };
    const afterSettle: PendingRefundRow = { ...row, deltaClp: 11000, settledClp: 9990, inFlight: null };
    repo.pendingRefundRow = vi.fn(async () => afterSettle).mockResolvedValueOnce(partial);
    repo.settleRefund = vi.fn(async (): Promise<SettleOutcome> => "applied").mockResolvedValueOnce("settled");
    repo.backingBoletas = vi.fn(async () => [{ liveAmount: 3000, paymentId: "mp_2" }]);
    const gw = makeGateway({
      getRefund: vi.fn(async () => ({ id: "ref_ip", status: "approved", amount: 9990 })),
      refundPayment: vi.fn(async (pid: string, amt?: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })),
    });
    const { service } = svc({ repo, gw });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 11000, offline: false }));
    expect(repo.settleRefund).toHaveBeenNthCalledWith(1, "rs1", "ref_ip", 9990);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_2", 1010, "refund:mp_2:1010:rs1");
    expect(repo.settleRefund).toHaveBeenNthCalledWith(2, "rs1", "ref_mp_2", 1010);
  });

  it("in-flight sigue in_process → refund_pending sin tocar MP", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => ({ ...row, inFlight: { paymentId: "mp_123", refundId: "ref_ip" } }));
    const gw = makeGateway({ getRefund: vi.fn(async () => ({ id: "ref_ip", status: "in_process", amount: 2000 })) });
    const { service, inbox } = svc({ repo, gw });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refund_pending", rescheduleId: "rs1", amount: 2000, reason: "in_process" }));
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(repo.settleRefund).not.toHaveBeenCalled();
    expect(repo.markRefundInFlight).not.toHaveBeenCalled();
  });

  it("in-flight rechazado → nuevo intento con clave salada ':after:ref_ip'", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => ({ ...row, inFlight: { paymentId: "mp_123", refundId: "ref_ip" } }));
    const gw = makeGateway({ getRefund: vi.fn(async () => ({ id: "ref_ip", status: "rejected", amount: 2000 })) });
    const { service } = svc({ repo, gw });
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(repo.markRefundInFlight).toHaveBeenCalledWith("rs1", null);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000, "refund:mp_123:2000:rs1:after:ref_ip");
    expect(repo.settleRefund).toHaveBeenCalledWith("rs1", "ref_9", 2000);
  });

  it("in-flight que MP ya no encuentra (null) → misma salida que rechazado", async () => {
    const repo = makeRepo(CTX, [{ liveAmount: 9990, paymentId: "mp_123" }]);
    repo.pendingRefundRow = vi.fn(async () => ({ ...row, inFlight: { paymentId: "mp_123", refundId: "ref_ip" } }));
    const { service, gw } = svc({ repo }); // getRefund por defecto → null
    expect(await service.retryRefund("rs1")).toEqual(ok({ kind: "refunded", amount: 2000, offline: false }));
    expect(repo.markRefundInFlight).toHaveBeenCalledWith("rs1", null);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000, "refund:mp_123:2000:rs1:after:ref_ip");
  });

  it("fila no pendiente → err('noop')", async () => {
    const repo = makeRepo(CTX);
    repo.pendingRefundRow = vi.fn(async () => null);
    const { service, gw } = svc({ repo });
    expect(await service.retryRefund("rs1")).toEqual(err("noop"));
    expect(gw.refundPayment).not.toHaveBeenCalled();
  });
});

describe("RescheduleService.retryFailedChargeRefund (H9)", () => {
  const row = { rescheduleId: "rs1", deltaOrderId: "do1", paymentId: "payd" };

  it("approved → inbox + markChargeRefunded → done", async () => {
    const repo = makeRepo(CTX);
    repo.markChargeRefunded = vi.fn(async () => {});
    const gw = makeGateway({ refundPayment: vi.fn(async () => ({ id: "ref_d", status: "approved", amount: 3000 })) });
    const { service, inbox } = svc({ repo, gw });
    expect(await service.retryFailedChargeRefund(row)).toBe("done");
    expect(gw.refundPayment).toHaveBeenCalledWith("payd"); // total, misma clave por defecto que usó el webhook
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_d", "refund", expect.anything());
    expect(repo.markChargeRefunded).toHaveBeenCalledWith("do1", "ref_d");
  });

  it("in_process → pending; sin inbox ni mark", async () => {
    const repo = makeRepo(CTX);
    const gw = makeGateway({ refundPayment: vi.fn(async () => ({ id: "ref_d", status: "in_process", amount: 3000 })) });
    const { service, inbox } = svc({ repo, gw });
    expect(await service.retryFailedChargeRefund(row)).toBe("pending");
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(repo.markChargeRefunded).not.toHaveBeenCalled();
  });

  it("MP lanza → failed; sin inbox ni mark", async () => {
    const repo = makeRepo(CTX);
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        throw new Error("MP down");
      }),
    });
    const { service, inbox } = svc({ repo, gw });
    expect(await service.retryFailedChargeRefund(row)).toBe("failed");
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect(repo.markChargeRefunded).not.toHaveBeenCalled();
  });
});

describe("RescheduleService.cancelPendingCharge", () => {
  it("cancelPendingCharge delega en el repo", async () => {
    const { service, repo } = svc();
    expect(await service.cancelPendingCharge("rs0", "admin-1")).toBe(true);
    expect(repo.cancelCharge).toHaveBeenCalledWith("rs0", "admin-1");
  });
});

describe("RescheduleService.reschedule — cortesía (sin orden)", () => {
  it("cortesía confirmada → moveCourtesy (rango por tz de la sala), sin cotizar ni MP", async () => {
    const pricing = makePricing(9990);
    const repo = makeRepo(COURTESY);
    const { service } = svc({ repo, pricing });

    const res = await service.reschedule(input);

    expect(res.ok && res.value).toEqual({ kind: "moved" });
    expect(pricing.quoteBooking).not.toHaveBeenCalled(); // sin plata no hay cotización
    const args = vi.mocked(repo.moveCourtesy).mock.calls[0][0];
    // 2026-07-13 18:00 America/Santiago (UTC−4 en julio) → 22:00Z, 1 h.
    expect(Date.parse(args.startsAt)).toBe(Date.parse("2026-07-13T22:00:00Z"));
    expect(Date.parse(args.endsAt) - Date.parse(args.startsAt)).toBe(3_600_000);
  });

  it("cortesía a <12 h de su inicio → IGUAL se puede mover (sin plata no aplica la política)", async () => {
    const repo = makeRepo({ ...COURTESY, reservation: { ...COURTESY.reservation, startsAt: "2026-07-10T14:00:00Z" } });
    const { service } = svc({ repo });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "moved" });
  });

  it("destino en el pasado → error", async () => {
    const { service } = svc({ repo: makeRepo(COURTESY) });
    const res = await service.reschedule({ ...input, date: "2026-07-01" });
    expect(res.ok).toBe(false);
  });

  it("cortesía cancelada o bloqueo → not_active", async () => {
    const cancelled = svc({ repo: makeRepo({ ...COURTESY, reservation: { ...COURTESY.reservation, status: "cancelled" } }) });
    expect((await cancelled.service.reschedule(input)).ok).toBe(false);
    const block = svc({ repo: makeRepo({ ...COURTESY, reservation: { ...COURTESY.reservation, kind: "block" } }) });
    expect((await block.service.reschedule(input)).ok).toBe(false);
  });
});

/**
 * Regresión de la reserva real (Patricio, 2026-08-24). El pedido se cobró en
 * 67.970 porque el staff le dio 8.000 de descuento sobre un quote de 75.970. Al
 * mover a un horario del MISMO precio, el motor volvía a cotizar 75.970 y el
 * sistema le pedía al cliente los 8.000 que se le habían regalado, lo que obligó
 * a cancelar y re-crear la reserva a mano (y dejó un cobro fantasma en prod).
 */
describe("reagendar con descuento manual — la concesión se arrastra", () => {
  const CON_CONCESION: RescheduleContext = {
    ...CTX,
    order: { ...CTX.order!, amountClp: 67970 },
    concessionClp: 8000,
    concessionLabel: "Descuento 20% Grabación audio + video",
  };

  it("mismo precio → se mueve sin cobrar ni devolver nada", async () => {
    const repo = makeRepo(CON_CONCESION);
    const r = await svc({ repo, pricing: makePricing(75970) }).service.reschedule(input);
    expect(r).toEqual(ok({ kind: "moved" }));
    expect(repo.createCharge).not.toHaveBeenCalled();
    expect(repo.moveDown).not.toHaveBeenCalled();
    expect(repo.moveEqual).toHaveBeenCalledTimes(1);
  });

  it("las líneas persistidas suman el efectivo y conservan la glosa del descuento", async () => {
    const repo = makeRepo(CON_CONCESION);
    await svc({ repo, pricing: makePricing(75970) }).service.reschedule(input);
    const [args] = vi.mocked(repo.moveEqual).mock.calls[0];
    expect(args.lines.reduce((s: number, l: { subtotal_clp: number }) => s + l.subtotal_clp, 0)).toBe(67970);
    expect(args.lines.at(-1)).toMatchObject({
      line_type: "discount",
      description: "Descuento 20% Grabación audio + video",
      subtotal_clp: -8000,
    });
  });

  it("el snapshot persistido es el del MOTOR, para poder re-deducir la concesión al mover otra vez", async () => {
    const repo = makeRepo(CON_CONCESION);
    await svc({ repo, pricing: makePricing(75970) }).service.reschedule(input);
    const [args] = vi.mocked(repo.moveEqual).mock.calls[0];
    expect(args.snapshot.total).toBe(75970);
  });

  it("horario más caro → solo se cobra la diferencia real, no la concesión", async () => {
    const repo = makeRepo(CON_CONCESION);
    // Motor 85.970 − 8.000 de concesión = 77.970 vs 67.970 pagados → 10.000.
    const r = await svc({ repo, pricing: makePricing(85970) }).service.reschedule(input);
    expect(r.ok && r.value).toMatchObject({ kind: "charge_pending", amount: 10000 });
  });

  it("horario más barato → devuelve solo la baja real de precio", async () => {
    const repo = makeRepo(CON_CONCESION);
    // Motor 65.970 − 8.000 = 57.970 vs 67.970 pagados → 10.000 de vuelta.
    const gw = makeGateway({ refundPayment: vi.fn(async (pid: string, amt?: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })) });
    const r = await svc({ repo, gw, pricing: makePricing(65970) }).service.reschedule(input);
    expect(r.ok && r.value).toMatchObject({ kind: "refunded", amount: 10000 });
    expect(repo.moveDown).toHaveBeenCalledWith(expect.objectContaining({ refundAmount: 10000 }));
  });

  it("sin concesión el comportamiento no cambia: mismo precio de motor, mismo cobro", async () => {
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, amountClp: 75970 } });
    const r = await svc({ repo, pricing: makePricing(75970) }).service.reschedule(input);
    expect(r).toEqual(ok({ kind: "moved" }));
    const [args] = vi.mocked(repo.moveEqual).mock.calls[0];
    expect(args.lines.some((l: { line_type: string }) => l.line_type === "discount")).toBe(false);
  });
});
