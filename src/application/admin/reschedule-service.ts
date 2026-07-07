import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import type { ReschedulePort } from "@/src/application/ports/reschedule";
import type { PaymentService } from "@/src/application/payment/payment-service";
import type { PricingService } from "@/src/application/pricing/pricing-service";
import { classifyReschedule } from "@/src/domain/scheduling/reschedule";
import { reschedulePolicy } from "@/src/domain/scheduling/cancellation-policy";
import { orderLinesFromQuote } from "@/src/domain/pricing/order-lines";
import { err, ok, type Result } from "@/src/domain/shared/result";

/** Inbox compartido con el webhook: dedupe por `refund:{id}` (misma clave que RefundService). */
export type RescheduleInbox = Pick<PaymentNotificationRepository, "recordEvent">;

/** Ventana de pago del cobro de reagendamiento (sin hold; el cliente ausente paga cuando puede). */
const RESCHEDULE_CHARGE_TTL_MINUTES = 24 * 60;

export interface RescheduleInput {
  reservationId: string;
  date: string; // YYYY-MM-DD (local de la locación)
  startMinute: number;
  durationHours: number;
  createdBy?: string | null;
  now?: Date;
}

export type RescheduleOutcome =
  | { kind: "moved" }
  | { kind: "refunded"; amount: number; offline: boolean }
  /** Raro: el weblook loopback ganó la carrera del inbox y ya asentó/canceló. */
  | { kind: "refund_looped_back" }
  /** Más caro: se creó el cobro del delta; la reserva se mueve cuando el cliente pague. */
  | { kind: "charge_pending"; deltaOrderId: string; rescheduleId: string; initPoint: string; amount: number };

/** Un `mp_payment_id` es reembolsable en MP si existe y no es un pago offline. */
function isRealMpPayment(id: string | null): id is string {
  return !!id && !id.startsWith("offline:");
}

/**
 * Reagenda (admin) una reserva PAGADA a otro horario. Re-cotiza en servidor y,
 * según el delta contra la boleta viva: mueve sin plata (equal), reembolsa el
 * delta en MP manteniendo el booking vivo (refund) o —en 3b— cobra el extra (charge).
 *
 * Orden MP→inbox→DB idéntico a RefundService: el reembolso ocurre ANTES del asiento
 * (si MP falla, nada cambia) y se registra en el inbox ANTES de `settleDown` para
 * que el webhook loopback NO cancele el booking que estamos manteniendo vivo.
 */
export class RescheduleService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly pricing: PricingService,
    private readonly repo: ReschedulePort,
    private readonly inbox: RescheduleInbox,
    private readonly payments: Pick<PaymentService, "createPreferenceForOrder">,
  ) {}

  async reschedule(input: RescheduleInput): Promise<Result<RescheduleOutcome, string>> {
    const now = input.now ?? new Date();

    const ctx = await this.repo.loadContext(input.reservationId);
    if (!ctx) return err("not_found");
    if (!ctx.order) return err("no_order");
    if (ctx.order.status !== "paid") return err("not_paid");
    if (ctx.reservation.status !== "confirmed" || ctx.reservation.kind !== "booking") return err("not_active");
    if (ctx.order.pointsRedeemedClp > 0) return err("points_order");
    if (!reschedulePolicy(ctx.reservation.startsAt, now).allowed) return err("too_late");

    const q = await this.pricing.quoteBooking({
      resourceId: ctx.reservation.resourceId,
      date: input.date,
      startMinute: input.startMinute,
      durationHours: input.durationHours,
      addonKeys: ctx.addonKeys,
    });
    if (!q.ok) return err(q.error);
    const { quote, startsAt, endsAt } = q.value;
    if (Date.parse(startsAt) <= now.getTime()) return err("target_past");

    const oldLive = ctx.order.amountClp - ctx.order.refundedAmountClp;
    const delta = classifyReschedule(oldLive, quote.total);
    const lines = orderLinesFromQuote(quote);
    const note = "Reagendada";
    const base = { reservationId: ctx.reservation.id, startsAt, endsAt, snapshot: quote, lines, note };

    if (delta.kind === "equal") {
      await this.repo.moveEqual(base);
      return ok({ kind: "moved" });
    }

    if (delta.kind === "refund") {
      // Pago offline: sin MP y sin inbox (la devolución física la hace el dueño).
      if (!isRealMpPayment(ctx.order.mpPaymentId)) {
        await this.repo.settleDown({ ...base, refundId: "offline:reschedule", refundAmount: delta.amount });
        return ok({ kind: "refunded", amount: delta.amount, offline: true });
      }
      // MP real: reembolso PRIMERO (si lanza, aborta con la DB intacta).
      const refund = await this.gateway.refundPayment(ctx.order.mpPaymentId, delta.amount);
      // Inbox ANTES del asiento: si el loopback ya ganó, no reasentamos (y ese
      // camino ya canceló vía mark_refunded — se avisa para revisión del dueño).
      const fresh = await this.inbox.recordEvent(`refund:${refund.id}`, "refund", refund);
      if (!fresh) return ok({ kind: "refund_looped_back" });
      await this.repo.settleDown({ ...base, refundId: refund.id, refundAmount: delta.amount });
      return ok({ kind: "refunded", amount: delta.amount, offline: false });
    }

    // delta.kind === "charge" — nuevo más caro: cobro diferido. Crea la orden de
    // delta + su preference; la reserva NO se mueve hasta que el cliente pague (el
    // webhook finaliza vía apply_reschedule_charge). Split del delta proporcional al
    // quote nuevo (mismo criterio que create_boleta_amount en la DB).
    const deltaNet = Math.round((delta.amount * quote.net) / quote.total);
    const deltaTax = delta.amount - deltaNet;
    const { rescheduleId, deltaOrderId } = await this.repo.createCharge({
      ...base,
      delta: delta.amount,
      deltaNet,
      deltaTax,
      createdBy: input.createdBy ?? null,
    });
    const pref = await this.payments.createPreferenceForOrder(deltaOrderId, {
      expiresInMinutes: RESCHEDULE_CHARGE_TTL_MINUTES,
    });
    if (!pref.ok) return err(pref.error);
    return ok({ kind: "charge_pending", deltaOrderId, rescheduleId, initPoint: pref.value.initPoint, amount: delta.amount });
  }
}
