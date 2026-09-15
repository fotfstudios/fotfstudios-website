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
    chargeForOrder: vi.fn(async () => ({ deltaOrderId: "do1", rescheduleId: "rs1" })),
    applyCharge: vi.fn(async () => "applied" as const),
    markChargeRefunded: vi.fn(async () => {}),
    pendingRefundForOrder: vi.fn(async () => null),
    settleRefund: vi.fn(async () => "applied" as const),
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

  it("slot tomado al pagar → devuelve el excedente, inbox, markChargeRefunded → reschedule_charge_failed{refund:'done'}", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ applyCharge: vi.fn(async () => "slot_taken" as const) });
    const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
    (gw.refundPayment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ref_slot", status: "approved", amount: 3000 });
    const svc = new WebhookService(gw, repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res).toMatchObject({
      result: "reschedule_charge_failed",
      orderId: "do1",
      chargeFailure: { reason: "slot_taken", refund: "done" },
    });
    expect(gw.refundPayment).toHaveBeenCalledWith("payd");
    // Inbox-first: reclama refund:ref_slot para que la re-entrega del webhook dedupee.
    expect(repo.recordEvent).toHaveBeenCalledWith("refund:ref_slot", "refund", expect.anything());
    expect(fin.markChargeRefunded).toHaveBeenCalledWith("do1", "ref_slot");
  });

  it("reservation_gone y charge_void se tratan igual que slot_taken", async () => {
    for (const reason of ["reservation_gone", "charge_void"] as const) {
      const repo = makeRepo();
      const fin = makeFinalizer({ applyCharge: vi.fn(async () => reason) });
      const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
      (gw.refundPayment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ref_x", status: "approved", amount: 3000 });
      const svc = new WebhookService(gw, repo, fin);
      const res = await svc.handlePaymentNotification("payd");
      expect(res.chargeFailure).toEqual({ reason, refund: "done" });
    }
  });

  it("el reembolso del delta lanza → refund:'failed', sin inbox ni mark (el cron lo reintenta)", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ applyCharge: vi.fn(async () => "slot_taken" as const) });
    const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
    (gw.refundPayment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("MP down"));
    const svc = new WebhookService(gw, repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res.chargeFailure).toEqual({ reason: "slot_taken", refund: "failed" });
    expect(fin.markChargeRefunded).not.toHaveBeenCalled();
    expect(repo.recordEvent).not.toHaveBeenCalledWith(expect.stringMatching(/^refund:/), "refund", expect.anything());
  });

  it("el reembolso del delta queda in_process → refund:'pending', sin inbox ni mark (lo asienta el loopback)", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({ applyCharge: vi.fn(async () => "slot_taken" as const) });
    const gw = makeGateway({ status: "approved", externalReference: "do1", amount: 3000 });
    (gw.refundPayment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ref_ip", status: "in_process", amount: 3000 });
    const svc = new WebhookService(gw, repo, fin);
    const res = await svc.handlePaymentNotification("payd");
    expect(res.chargeFailure).toEqual({ reason: "slot_taken", refund: "pending" });
    expect(fin.markChargeRefunded).not.toHaveBeenCalled();
    expect(repo.recordEvent).not.toHaveBeenCalledWith("refund:ref_ip", "refund", expect.anything());
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
    const fin = makeFinalizer({ chargeForOrder: vi.fn(async () => null) });
    const svc = new WebhookService(makeGateway({ status: "approved", externalReference: "o1", amount: 9990 }), repo, fin);
    expect((await svc.handlePaymentNotification("pay1")).result).toBe("paid");
    expect(fin.applyCharge).not.toHaveBeenCalled();
    expect(repo.confirmPaid).toHaveBeenCalled();
  });
});

/**
 * El pedido de curso no tiene reserva: si llegara a confirmPaid, confirm_payment
 * devolvería 'paid_no_hold', no emitiría boleta y suprimiría el email al alumno.
 * Por eso se desvía, igual que el cobro de reagendamiento.
 */
describe("WebhookService — finalizador de curso", () => {
  const courseFinalizer = (pending: boolean, outcome: "applied" | "noop" = "applied") => ({
    pendingCourseOrder: vi.fn(async () => (pending ? { orderId: "o-curso" } : null)),
    applyCoursePayment: vi.fn(async () => outcome),
  });

  it("un pago aprobado de una inscripción va al finalizador y NUNCA a confirmPaid", async () => {
    const repo = makeRepo();
    const curso = courseFinalizer(true);
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o-curso", amount: 159980 }),
      repo,
      undefined,
      curso,
    );

    expect(await svc.handlePaymentNotification("pay1")).toEqual({ result: "course_paid", orderId: "o-curso" });
    expect(curso.applyCoursePayment).toHaveBeenCalledWith("o-curso", "pay1");
    expect(repo.confirmPaid).not.toHaveBeenCalled();
  });

  it("un pedido que no es de curso sigue por el camino normal", async () => {
    const repo = makeRepo();
    const curso = courseFinalizer(false);
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o1", amount: 9990 }),
      repo,
      undefined,
      curso,
    );

    expect((await svc.handlePaymentNotification("pay1")).result).toBe("paid");
    expect(repo.confirmPaid).toHaveBeenCalled();
  });

  // El cobro de reagendamiento se evalúa ANTES: es el camino ya probado y una
  // orden de delta nunca es de curso.
  it("el cobro de reagendamiento conserva la prioridad", async () => {
    const repo = makeRepo();
    const curso = courseFinalizer(true);
    const resched = {
      chargeForOrder: vi.fn(async () => ({ deltaOrderId: "o-delta", rescheduleId: "r1" })),
      applyCharge: vi.fn(async () => "applied" as const),
      markChargeRefunded: vi.fn(async () => {}),
      pendingRefundForOrder: vi.fn(async () => null),
      settleRefund: vi.fn(async () => "applied" as const),
    };
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o-delta", amount: 5000 }),
      repo,
      resched,
      curso,
    );

    expect((await svc.handlePaymentNotification("pay1")).result).toBe("reschedule_applied");
    expect(curso.applyCoursePayment).not.toHaveBeenCalled();
  });

  it("una re-entrega del mismo pago no vuelve a finalizar (inbox)", async () => {
    const repo = makeRepo({ recordEvent: vi.fn(async () => false) });
    const curso = courseFinalizer(true);
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o-curso", amount: 159980 }),
      repo,
      undefined,
      curso,
    );

    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
    expect(curso.applyCoursePayment).not.toHaveBeenCalled();
  });

  it("si la inscripción ya se anuló, el resultado es duplicate y no rompe", async () => {
    const repo = makeRepo();
    const curso = courseFinalizer(true, "noop");
    const svc = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o-curso", amount: 159980 }),
      repo,
      undefined,
      curso,
    );

    expect((await svc.handlePaymentNotification("pay1")).result).toBe("duplicate");
    expect(repo.confirmPaid).not.toHaveBeenCalled();
  });
});

describe("WebhookService — estado del reembolso", () => {
  it("un reembolso in_process NO se asienta ni entra al inbox (queda para la entrega que lo apruebe)", async () => {
    const repo = makeRepo();
    const svc = new WebhookService(
      makeGateway({
        status: "approved",
        externalReference: "o1",
        amount: 9990,
        refunds: [{ id: "ref_p", amount: 9990, status: "in_process" }],
      }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(repo.markRefunded).not.toHaveBeenCalled();
    expect(repo.recordEvent).not.toHaveBeenCalledWith("refund:ref_p", "refund", expect.anything());
    // El pago sigue approved y ya estaba confirmado: inbox por status → duplicate.
    expect(res.result).not.toBe("refunded");
  });

  it("in_process en la 1ª entrega y approved en la 2ª → se asienta UNA vez, en la 2ª", async () => {
    // Inbox con semántica real: la primera vez que se ve un id es fresco, después duplicado.
    const seen = new Set<string>();
    const repo = makeRepo({
      recordEvent: vi.fn(async (id: string) => (seen.has(id) ? false : (seen.add(id), true))),
    });
    const refund = { id: "ref_p", amount: 9990 };
    const first = new WebhookService(
      makeGateway({ status: "approved", externalReference: "o1", amount: 9990, refunds: [{ ...refund, status: "in_process" }] }),
      repo,
    );
    const second = new WebhookService(
      makeGateway({ status: "refunded", externalReference: "o1", refunds: [{ ...refund, status: "approved" }] }),
      repo,
    );
    expect((await first.handlePaymentNotification("pay1")).result).not.toBe("refunded");
    expect(await second.handlePaymentNotification("pay1")).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 9990 });
    expect(repo.markRefunded).toHaveBeenCalledTimes(1);
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_p", 9990);
  });

  it("un reembolso rechazado nunca asienta, aunque el pago venga con otros aprobados", async () => {
    const repo = makeRepo();
    const svc = new WebhookService(
      makeGateway({
        status: "approved",
        externalReference: "o1",
        refunds: [
          { id: "ref_ok", amount: 3000, status: "approved" },
          { id: "ref_no", amount: 2000, status: "rejected" },
        ],
      }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(res).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 3000 });
    expect(repo.markRefunded).toHaveBeenCalledTimes(1);
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_ok", 3000);
  });

  it("re-entrega de un pago ya reembolsado (todo duplicado) → duplicate, no pending", async () => {
    // El refund ya está en el inbox (loopback admin o entrega anterior); el evento por status es nuevo.
    const repo = makeRepo({ recordEvent: vi.fn(async (id: string) => !id.startsWith("refund:")) });
    const svc = new WebhookService(
      makeGateway({
        status: "refunded",
        externalReference: "o1",
        refunds: [{ id: "ref_a", amount: 9990, status: "approved" }],
      }),
      repo,
    );
    const res = await svc.handlePaymentNotification("pay1");
    expect(res).toEqual({ result: "duplicate", orderId: "o1" });
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });
});

describe("WebhookService — reembolso sobre reserva con reagendamiento pendiente", () => {
  it("reembolso fresco + fila pending_refund → settleRefund, NO mark_refunded → reschedule_refund_settled", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 2000 })),
      settleRefund: vi.fn(async () => "applied" as const),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "reschedule_refund_settled", orderId: "o1", refundedAmount: 2000 });
    expect(fin.settleRefund).toHaveBeenCalledWith("rs1", "ref_w", 2000);
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });

  it("reembolso MAYOR al pendiente de la fila (reembolso total desde el panel) → mark_refunded como siempre, con error en el log; no settle", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 2000 })),
    });
    const gw = makeGateway({
      id: "p1",
      status: "refunded",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_full", status: "approved", amount: 9990 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 9990 });
    expect(fin.settleRefund).not.toHaveBeenCalled();
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_full", 9990);
    expect(log).toHaveBeenCalledWith("[webhook] reembolso mayor al pendiente de reagendamiento", {
      orderId: "o1",
      refundId: "ref_full",
      amount: 9990,
      remainingClp: 2000,
    });
    log.mockRestore();
  });

  it("reembolso que cabe justo en lo pendiente (== remainingClp) → settle", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 2000 })),
      settleRefund: vi.fn(async () => "applied" as const),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "reschedule_refund_settled", orderId: "o1", refundedAmount: 2000 });
    expect(fin.settleRefund).toHaveBeenCalledWith("rs1", "ref_w", 2000);
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });

  it("reembolso menor al pendiente (un split de multi-pago) → settle", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 11000 })),
      settleRefund: vi.fn(async () => "settled" as const),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_a", status: "approved", amount: 9990 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "reschedule_refund_settled", orderId: "o1", refundedAmount: 9990 });
    expect(fin.settleRefund).toHaveBeenCalledWith("rs1", "ref_a", 9990);
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });

  it("settle cancelled (la reserva se canceló con el reembolso en vuelo) → cae a mark_refunded", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 2000 })),
      settleRefund: vi.fn(async () => "cancelled" as const),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 2000 });
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_w", 2000);
  });

  it("settle noop (la fila ya no está pendiente) → cae a mark_refunded como hoy", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs1", originalOrderId: "o1", remainingClp: 2000 })),
      settleRefund: vi.fn(async () => "noop" as const),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 2000 });
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_w", 2000);
  });

  it("sin fila pendiente → mark_refunded (sin cambios)", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: vi.fn(async () => null),
      pendingRefundForOrder: vi.fn(async () => null),
    });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(r).toEqual({ result: "refunded", orderId: "o1", refundedAmount: 2000 });
    expect(repo.markRefunded).toHaveBeenCalledWith("o1", "ref_w", 2000);
    expect(fin.settleRefund).not.toHaveBeenCalled();
  });

  it("reembolso duplicado → ni lookup ni settle", async () => {
    const repo = makeRepo({ recordEvent: vi.fn(async () => false) });
    const fin = makeFinalizer({ chargeForOrder: vi.fn(async () => null) });
    const gw = makeGateway({
      id: "p1",
      status: "approved",
      externalReference: "o1",
      amount: 9990,
      refunds: [{ id: "ref_w", status: "approved", amount: 2000 }],
    });
    await new WebhookService(gw, repo, fin).handlePaymentNotification("p1");
    expect(fin.pendingRefundForOrder).not.toHaveBeenCalled();
    expect(fin.settleRefund).not.toHaveBeenCalled();
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });

  // H1 de 2º orden: el reembolso del propio cobro fallido (H9) llega en `payment.refunds[]`
  // de una re-entrega posterior sobre la orden de DELTA. `pendingRefundForOrder` resuelve por
  // RESERVA (original o delta) — si se consultara acá podría asentar por error una fila
  // pending_refund MÁS NUEVA de la misma reserva en vez del mark_refunded de siempre.
  // `chargeForOrder` con la MISMA lógica de estados que el repo real (filtro sobre filas en
  // memoria, no una constante): lo que se prueba es que `failed_slot_taken` entra al filtro.
  const CHARGE_STATUSES = ["pending_charge", "cancelled", "expired", "failed_slot_taken"];
  const chargeRows = [
    { id: "rs1", delta_order_id: "do1", status: "failed_slot_taken" },
    { id: "rs2", delta_order_id: "do2", status: "applied" },
  ];
  const chargeForOrderLike = vi.fn(async (orderId: string) => {
    const row = chargeRows.find((r) => r.delta_order_id === orderId && CHARGE_STATUSES.includes(r.status));
    return row ? { deltaOrderId: row.delta_order_id, rescheduleId: row.id } : null;
  });

  // FR1 (auditoría 2026-09-14): un reembolso FRESCO sobre el pago de un cobro de
  // reagendamiento (isChargeOrder true, cualquiera sea su status — acá failed_slot_taken)
  // sigue asentando mark_refunded como siempre, pero el OUTCOME ya no es "refunded": esa
  // etiqueta dispara notifyCancellation("Reserva cancelada...") en el route, y `orderId` acá
  // es la orden de DELTA — la reserva puede seguir viva. `reschedule_charge_refunded` deja
  // que el route decida el aviso correcto (ver rescheduleNotifyInfo).
  it("reembolso fresco sobre el pago de un cobro → reschedule_charge_refunded (no 'refunded')", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: chargeForOrderLike,
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs9", originalOrderId: "o-other", remainingClp: 5000 })),
    });
    const gw = makeGateway({
      id: "payd",
      status: "approved",
      externalReference: "do1",
      amount: 3000,
      refunds: [{ id: "ref_d", status: "approved", amount: 3000 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("payd");
    expect(r).toEqual({ result: "reschedule_charge_refunded", orderId: "do1", refundedAmount: 3000 });
    expect(chargeForOrderLike).toHaveBeenCalledWith("do1");
    expect(fin.pendingRefundForOrder).not.toHaveBeenCalled();
    expect(fin.settleRefund).not.toHaveBeenCalled();
    expect(repo.markRefunded).toHaveBeenCalledWith("do1", "ref_d", 3000);
  });

  it("el delta de un cobro ya APLICADO no es 'cobro' para el filtro: su reembolso sí consulta la fila pendiente", async () => {
    const repo = makeRepo();
    const fin = makeFinalizer({
      chargeForOrder: chargeForOrderLike,
      pendingRefundForOrder: vi.fn(async () => ({ rescheduleId: "rs9", originalOrderId: "o1", remainingClp: 5000 })),
      settleRefund: vi.fn(async () => "applied" as const),
    });
    const gw = makeGateway({
      id: "payd2",
      status: "approved",
      externalReference: "do2",
      amount: 3000,
      refunds: [{ id: "ref_d2", status: "approved", amount: 1010 }],
    });
    const r = await new WebhookService(gw, repo, fin).handlePaymentNotification("payd2");
    expect(r).toEqual({ result: "reschedule_refund_settled", orderId: "do2", refundedAmount: 1010 });
    expect(fin.settleRefund).toHaveBeenCalledWith("rs9", "ref_d2", 1010);
    expect(repo.markRefunded).not.toHaveBeenCalled();
  });
});
