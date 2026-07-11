import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import type { ReschedulePort } from "@/src/application/ports/reschedule";
import type { PaymentService } from "@/src/application/payment/payment-service";
import type { PricingService } from "@/src/application/pricing/pricing-service";
import { classifyReschedule } from "@/src/domain/scheduling/reschedule";
import { splitRefundAcrossPayments } from "@/src/domain/scheduling/refund-split";
import { rangeFor } from "@/src/domain/scheduling/time";
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
 * Orden money-safety: en el camino MP real el asiento (reschedule_down) va PRIMERO
 * —aborta limpio por GiST sin tocar plata—, luego el reembolso irreversible en MP, y
 * el inbox reclama el refund id para que el webhook loopback no cancele el booking vivo.
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
    if (ctx.reservation.status !== "confirmed" || ctx.reservation.kind !== "booking") return err("not_active");

    // Cortesía (sin orden): movimiento puro de calendario — sin plata no hay
    // cotización, MP ni política de 12 h (misma flexibilidad que crearla). El
    // rango destino se arma con la tz de la sala; el GiST es la red anti-solape.
    if (!ctx.order) {
      const range = rangeFor(input.date, input.startMinute, input.durationHours, ctx.timezone);
      if (Date.parse(range.startsAt) <= now.getTime()) return err("target_past");
      await this.repo.moveCourtesy({ reservationId: ctx.reservation.id, ...range, note: null });
      return ok({ kind: "moved" });
    }

    if (ctx.order.status !== "paid") return err("not_paid");
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
    // Sin nota automática: la tabla `reschedules` es el registro (la línea de
    // tiempo del admin lo muestra); las notas quedan para el operador.
    const base = { reservationId: ctx.reservation.id, startsAt, endsAt, snapshot: quote, lines, note: null };

    if (delta.kind === "equal") {
      await this.repo.moveEqual(base);
      return ok({ kind: "moved" });
    }

    if (delta.kind === "refund") {
      // Reparto por-pago: un pedido encarecido tiene boletas de distintos pagos MP
      // (original + orden de delta). Se lee ANTES de asentar (settleDown anula las
      // boletas), más-antigua-primero (el mismo orden en que reschedule_down emite las NC).
      const splits = splitRefundAcrossPayments(await this.repo.backingBoletas(ctx.order.id), delta.amount);

      // Todo offline: sin MP y sin inbox (la devolución física la hace el dueño).
      if (!splits.some((s) => isRealMpPayment(s.paymentId))) {
        await this.repo.settleDown({ ...base, refundId: "offline:reschedule", refundAmount: delta.amount });
        return ok({ kind: "refunded", amount: delta.amount, offline: true });
      }
      // MP real — I2: SEMBRAR primero (el asiento aborta limpio por GiST si el slot se
      // tomó en la carrera, SIN tocar plata), y recién con el asiento firme reembolsar
      // cada pago contra SU medio. La porción offline la devuelve el dueño.
      await this.repo.settleDown({ ...base, refundId: null, refundAmount: delta.amount });
      let primaryRefundId: string | null = null;
      for (const s of splits) {
        if (!isRealMpPayment(s.paymentId)) continue;
        const refund = await this.gateway.refundPayment(s.paymentId, s.amount);
        // Reclamar el inbox para que el loopback de ESTE reembolso dedupee (no cancele el
        // booking ya movido). Si el loopback ganó la ventana (raro), se avisa para revisión.
        const fresh = await this.inbox.recordEvent(`refund:${refund.id}`, "refund", refund);
        if (!fresh) return ok({ kind: "refund_looped_back" });
        primaryRefundId = primaryRefundId ?? refund.id;
      }
      if (primaryRefundId) await this.repo.setRefundId(ctx.order.id, primaryRefundId);
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
