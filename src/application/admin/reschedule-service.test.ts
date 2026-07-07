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

function makeRepo(ctx: RescheduleContext | null): ReschedulePort {
  return {
    loadContext: vi.fn(async () => ctx),
    moveEqual: vi.fn(async () => {}),
    settleDown: vi.fn(async () => {}),
  };
}

function makeInbox(over = {}) {
  return { recordEvent: vi.fn(async () => true), ...over };
}

const CTX: RescheduleContext = {
  reservation: { id: "r1", resourceId: "res1", startsAt: OLD_START, status: "confirmed", kind: "booking" },
  order: { id: "o1", status: "paid", amountClp: 9990, refundedAmountClp: 0, pointsRedeemedClp: 0, mpPaymentId: "mp_123" },
  addonKeys: [],
};

const input = { reservationId: "r1", date: "2026-07-13", startMinute: 1080, durationHours: 1, now: NOW };

function svc(o: { pricing?: Pick<PricingService, "quoteBooking">; gw?: Pick<PaymentGateway, "refundPayment">; repo?: ReschedulePort; inbox?: ReturnType<typeof makeInbox> } = {}) {
  const repo = o.repo ?? makeRepo(CTX);
  const inbox = o.inbox ?? makeInbox();
  return {
    service: new RescheduleService(
      (o.gw ?? makeGateway()) as PaymentGateway,
      (o.pricing ?? makePricing(9990)) as PricingService,
      repo,
      inbox as never,
    ),
    repo,
    inbox,
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

  it("más barato con pago MP → refund PRIMERO → inbox → settleDown (en ese orden)", async () => {
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

    const { service } = svc({ pricing: makePricing(7990), gw, repo, inbox });
    const res = await service.reschedule(input);

    expect(res.ok && res.value).toEqual({ kind: "refunded", amount: 2000, offline: false });
    expect(gw.refundPayment).toHaveBeenCalledWith("mp_123", 2000);
    expect(inbox.recordEvent).toHaveBeenCalledWith("refund:ref_9", "refund", expect.anything());
    const settle = (repo.settleDown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(settle).toMatchObject({ refundId: "ref_9", refundAmount: 2000 });
    expect(calls).toEqual(["refund", "record", "settle"]); // MP → inbox → asiento
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

  it("más barato + loopback ganó (recordEvent→false) → NO asienta; refund_looped_back", async () => {
    const inbox = makeInbox({ recordEvent: vi.fn(async () => false) });
    const repo = makeRepo(CTX);
    const { service } = svc({ pricing: makePricing(7990), repo, inbox });
    const res = await service.reschedule(input);
    expect(res.ok && res.value).toEqual({ kind: "refund_looped_back" });
    expect(repo.settleDown).not.toHaveBeenCalled();
  });

  it("más barato + MP falla → aborta, sin asiento", async () => {
    const gw = makeGateway({ refundPayment: vi.fn(async () => { throw new Error("MP 500"); }) });
    const repo = makeRepo(CTX);
    const { service } = svc({ pricing: makePricing(7990), gw, repo });
    await expect(service.reschedule(input)).rejects.toThrow("MP 500");
    expect(repo.settleDown).not.toHaveBeenCalled();
  });

  it("más caro (charge) → error (no soportado en 3a)", async () => {
    const { service } = svc({ pricing: makePricing(19990) });
    const res = await service.reschedule(input);
    expect(res.ok).toBe(false);
  });

  it("guardas: sin orden / no pagada / reserva no confirmada / puntos / tarde / destino pasado", async () => {
    const guard = async (ctx: RescheduleContext, extra: Partial<typeof input> = {}, pricingTotal = 9990) => {
      const { service } = svc({ repo: makeRepo(ctx), pricing: makePricing(pricingTotal) });
      const res = await service.reschedule({ ...input, ...extra });
      return res.ok;
    };
    expect(await guard({ ...CTX, order: null })).toBe(false); // sin orden
    expect(await guard({ ...CTX, order: { ...CTX.order!, status: "pending_payment" } })).toBe(false); // no pagada
    expect(await guard({ ...CTX, reservation: { ...CTX.reservation, status: "cancelled" } })).toBe(false); // no activa
    expect(await guard({ ...CTX, order: { ...CTX.order!, pointsRedeemedClp: 5000 } })).toBe(false); // puntos
    expect(await guard({ ...CTX, reservation: { ...CTX.reservation, startsAt: "2026-07-10T18:00:00Z" } })).toBe(false); // <12h
  });
});
