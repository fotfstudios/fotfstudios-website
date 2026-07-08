import { describe, expect, it, vi } from "vitest";
import { RescheduleService } from "./reschedule-service";
import type { ReschedulePort, RescheduleContext } from "@/src/application/ports/reschedule";
import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PricingService } from "@/src/application/pricing/pricing-service";
import type { Quote } from "@/src/domain/pricing/types";
import { ok } from "@/src/domain/shared/result";

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

function makeGateway(over: Partial<PaymentGateway> = {}): Pick<PaymentGateway, "refundPayment"> {
  return { refundPayment: vi.fn(async () => ({ id: "ref_9", status: "approved", amount: 2000 })), ...over };
}

function makeRepo(ctx: RescheduleContext | null, backing?: { liveAmount: number; paymentId: string | null }[]): ReschedulePort {
  // Por defecto: una boleta viva financiada por el pago del pedido (caso común, un pago).
  const boletas =
    backing ?? (ctx?.order ? [{ liveAmount: ctx.order.amountClp - ctx.order.refundedAmountClp, paymentId: ctx.order.mpPaymentId }] : []);
  return {
    loadContext: vi.fn(async () => ctx),
    moveEqual: vi.fn(async () => {}),
    settleDown: vi.fn(async () => {}),
    setRefundId: vi.fn(async () => {}),
    createCharge: vi.fn(async () => ({ rescheduleId: "rs1", deltaOrderId: "do1" })),
    moveCourtesy: vi.fn(async () => {}),
    backingBoletas: vi.fn(async () => boletas),
  };
}

function makeInbox(over = {}) {
  return { recordEvent: vi.fn(async () => true), ...over };
}

function makePayments() {
  return { createPreferenceForOrder: vi.fn(async () => ok({ preferenceId: "pref1", initPoint: "https://mp/x" })) };
}

const CTX: RescheduleContext = {
  reservation: { id: "r1", resourceId: "res1", startsAt: OLD_START, status: "confirmed", kind: "booking" },
  order: { id: "o1", status: "paid", amountClp: 9990, refundedAmountClp: 0, pointsRedeemedClp: 0, mpPaymentId: "mp_123" },
  addonKeys: [],
  timezone: "America/Santiago",
};

const COURTESY: RescheduleContext = { ...CTX, order: null };

const input = { reservationId: "r1", date: "2026-07-13", startMinute: 1080, durationHours: 1, now: NOW };

function svc(o: {
  pricing?: Pick<PricingService, "quoteBooking">;
  gw?: Pick<PaymentGateway, "refundPayment">;
  repo?: ReschedulePort;
  inbox?: ReturnType<typeof makeInbox>;
  payments?: ReturnType<typeof makePayments>;
} = {}) {
  const repo = o.repo ?? makeRepo(CTX);
  const inbox = o.inbox ?? makeInbox();
  const payments = o.payments ?? makePayments();
  return {
    service: new RescheduleService(
      (o.gw ?? makeGateway()) as PaymentGateway,
      (o.pricing ?? makePricing(9990)) as PricingService,
      repo,
      inbox as never,
      payments,
    ),
    repo,
    inbox,
    payments,
  };
}

describe("RescheduleService.reschedule", () => {
  it("mismo precio → moveEqual, sin MP ni inbox", async () => {
    const { service, repo } = svc({ pricing: makePricing(9990) });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "moved" });
    expect(repo.moveEqual).toHaveBeenCalledOnce();
    expect(repo.settleDown).not.toHaveBeenCalled();
  });

  it("más barato con pago MP → settleDown PRIMERO → refund → inbox → setRefundId (en ese orden)", async () => {
    const calls: string[] = [];
    const gw = makeGateway({
      refundPayment: vi.fn(async () => {
        calls.push("refund");
        return { id: "ref_9", status: "approved", amount: 2000 };
      }),
    });
    const inbox = makeInbox({ recordEvent: vi.fn(async () => { calls.push("record"); return true; }) });
    const repo = makeRepo(CTX);
    (repo.settleDown as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls.push("settle"); });
    (repo.setRefundId as ReturnType<typeof vi.fn>).mockImplementation(async () => { calls.push("setRefundId"); });

    const { service } = svc({ pricing: makePricing(7990), gw, repo, inbox });
    const res = await service.reschedule(input);

    expect(res.ok && res.value).toEqual({ kind: "refunded", amount: 2000, offline: false });
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000);
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_9", "refund", expect.anything());
    expect(repo.setRefundId).toHaveBeenCalledWith("o1", "ref_9");
    const settle = (repo.settleDown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(settle).toMatchObject({ refundId: null, refundAmount: 2000 });
    expect(calls).toEqual(["settle", "refund", "record", "setRefundId"]); // asiento → MP → inbox → id
  });

  it("más barato multi-pago (encarecido antes) → reparte el reembolso por-pago", async () => {
    // oldLive 12990 (original 9990 @mp_123 + delta 3000 @mp_delta); abaratar a 2000 → refund 10990.
    const ctx2: RescheduleContext = { ...CTX, order: { ...CTX.order!, amountClp: 12990 } };
    const gw = { refundPayment: vi.fn(async (pid: string, amt: number) => ({ id: `ref_${pid}`, status: "approved", amount: amt })) };
    const repo = makeRepo(ctx2, [
      { liveAmount: 9990, paymentId: "mp_123" },
      { liveAmount: 3000, paymentId: "mp_delta" },
    ]);
    const { service } = svc({ pricing: makePricing(2000), gw, repo });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "refunded", amount: 10990, offline: false });
    // Cada pago recibe solo lo que capturó (MP rechaza sobre-reembolsos), más-antigua-primero.
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 9990);
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_delta", 1000);
    expect(gw.refundPayment).toHaveBeenCalledTimes(2);
    expect(repo.setRefundId).toHaveBeenCalledWith("o1", "ref_mp_123");
  });

  it("más barato con pago OFFLINE → settleDown offline:reschedule, sin MP ni inbox", async () => {
    const repo = makeRepo({ ...CTX, order: { ...CTX.order!, mpPaymentId: "offline:efectivo" } });
    const gw = makeGateway();
    const inbox = makeInbox();
    const { service } = svc({ pricing: makePricing(7990), gw, repo, inbox });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "refunded", amount: 2000, offline: true });
    expect(gw.refundPayment).not.toHaveBeenCalled();
    expect(inbox.recordEvent).not.toHaveBeenCalled();
    expect((repo.settleDown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ refundId: "offline:reschedule", refundAmount: 2000 });
  });

  it("más barato + loopback ganó (recordEvent→false) tras el asiento → refund_looped_back", async () => {
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const repo = makeRepo(CTX);
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "refund_looped_back" });
    expect(repo.settleDown).toHaveBeenCalledOnce(); // el asiento ya ocurrió (siembra-primero)
    expect(repo.setRefundId).not.toHaveBeenCalled();
  });

  it("más barato + slot tomado en la siembra (settleDown lanza) → NO se reembolsa en MP", async () => {
    const repo = makeRepo(CTX);
    (repo.settleDown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Ese horario ya está tomado."));
    const gw = makeGateway();
    const { service } = svc({ pricing: makePricing(7990), gw, repo });
    await expect(service.reschedule(input)).rejects.toThrow("Ese horario ya está tomado.");
    expect(gw.refundPayment).not.toHaveBeenCalled(); // I2: nada de plata si el asiento aborta
  });

  it("más caro (charge) → cobro diferido (charge_pending); NO mueve ni asienta", async () => {
    const { service, repo, payments } = svc({ pricing: makePricing(19990) });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toMatchObject({ kind: "charge_pending", deltaOrderId: "do1", initPoint: "https://mp/x", amount: 10000 });
    expect(repo.createCharge).toHaveBeenCalledOnce();
    expect(payments.createPreferenceForOrder).toHaveBeenCalledWith("do1", { expiresInMinutes: 1440 });
    expect(repo.moveEqual).not.toHaveBeenCalled();
    expect(repo.settleDown).not.toHaveBeenCalled();
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
});

describe("RescheduleService.reschedule — cortesía (sin orden)", () => {
  it("cortesía confirmada → moveCourtesy (rango por tz de la sala), sin cotizar ni MP", async () => {
    const pricing = makePricing(9990);
    const repo = makeRepo(COURTESY);
    const { service } = svc({ repo, pricing });

    const res = await service.reschedule(input);

    expect(res.ok && res.value).toEqual({ kind: "moved" });
    expect(pricing.quoteBooking).not.toHaveBeenCalled(); // sin plata no hay cotización
    const args = (repo.moveCourtesy as ReturnType<typeof vi.fn>).mock.calls[0][0];
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
