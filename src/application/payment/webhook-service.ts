import type { PaymentGateway } from "@/src/application/ports/payment";
import type { CourseFinalizer } from "@/src/application/ports/course";
import type { RescheduleFinalizer } from "@/src/application/ports/reschedule";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import { isSettledRefund } from "@/src/domain/scheduling/refund-split";

export type WebhookOutcome =
  | "paid"
  | "paid_unreserved"
  | "rejected"
  | "refunded"
  | "pending"
  | "duplicate"
  | "ignored"
  | "reschedule_applied"
  | "reschedule_charge_failed"
  | "reschedule_refund_settled"
  | "course_paid";

export interface WebhookResult {
  result: WebhookOutcome;
  orderId: string | null;
  /** Suma de los reembolsos FRESCOS procesados (solo cuando result === "refunded" o "reschedule_refund_settled"). */
  refundedAmount?: number;
  /** Detalle del cobro de reagendamiento no aplicado (solo cuando result === "reschedule_charge_failed"). */
  chargeFailure?: {
    reason: "slot_taken" | "reservation_gone" | "charge_void";
    refund: "done" | "pending" | "failed";
  };
}

/**
 * Procesa una notificación de pago de Mercado Pago. El estado se obtiene de la
 * API de MP (fuente de verdad), no del body.
 *
 * Idempotencia por inbox:
 *  - Reembolsos: uno por `refund:{id}` (un reembolso parcial NO cambia el status
 *    del pago → no podemos keyear por status; cada reembolso de `refunds[]` se
 *    procesa una vez). Cualquier reembolso cancela la reserva y emite NC por su monto.
 *  - Aprobación/rechazo: por `{paymentId}:{status}`.
 */
export class WebhookService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repo: PaymentNotificationRepository,
    /** Opcional: finaliza cobros de reagendamiento diferidos (Phase 3b). */
    private readonly finalizer?: RescheduleFinalizer,
    /** Opcional: finaliza inscripciones de curso pagadas por MP. */
    private readonly courseFinalizer?: CourseFinalizer,
  ) {}

  async handlePaymentNotification(paymentId: string): Promise<WebhookResult> {
    const payment = await this.gateway.getPayment(paymentId);
    const orderId = payment.externalReference ?? null;

    // Reembolsos (parciales o totales) primero: keyeados por refund id, porque un
    // reembolso parcial deja el pago en 'approved' (colisionaría con la aprobación).
    // Un reembolso iniciado desde el ADMIN ya viene registrado en el inbox
    // (RefundService, inbox-first) → aquí cae como duplicado: sin doble NC/email.
    let refunded = false;
    let settledReschedule = false;
    let refundedAmount = 0;
    // Si `orderId` es la orden de delta de un COBRO (chargeForOrder no-null), no cambia
    // entre reembolsos del mismo pago: se resuelve una sola vez, perezoso (solo si hay
    // algún reembolso fresco que lo necesite).
    let isChargeOrder: boolean | null = null;
    for (const r of payment.refunds ?? []) {
      // Solo `approved` es plata devuelta. Un `in_process`/`rejected` NO toca el inbox:
      // así, cuando MP lo notifique ya aprobado, el mismo id entra fresco y se asienta.
      if (!isSettledRefund(r)) continue;
      const freshRefund = await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
      if (!freshRefund || !orderId) continue;
      if (isChargeOrder === null) {
        isChargeOrder = this.finalizer ? (await this.finalizer.chargeForOrder(orderId)) != null : false;
      }
      // Un reembolso sobre una reserva con reagendamiento pendiente ASIENTA el reagendamiento
      // (el dueño lo devolvió desde el panel, o es el loopback del nuestro): jamás cancela.
      // Excepción: la orden de delta de un COBRO fallido (H9) tiene su propio reembolso, y
      // `pendingRefundForOrder` resuelve por RESERVA (original o delta) — consultarlo acá
      // podría asentar por error una fila pending_refund MÁS NUEVA de la misma reserva
      // (H1 de 2º orden). Para pagos de cobro se sigue el mark_refunded de siempre.
      const pend = !isChargeOrder && this.finalizer ? await this.finalizer.pendingRefundForOrder(orderId) : null;
      if (pend) {
        const res = await this.finalizer!.settleRefund(pend.rescheduleId, r.id, r.amount);
        if (res !== "noop") {
          settledReschedule = true;
          refundedAmount += r.amount;
          continue;
        }
      }
      await this.repo.markRefunded(orderId, r.id, r.amount);
      refunded = true;
      refundedAmount += r.amount;
    }
    if (refunded) return { result: "refunded", orderId, refundedAmount };
    if (settledReschedule) return { result: "reschedule_refund_settled", orderId, refundedAmount };
    // Pago ya reembolsado del todo y nada fresco: es una re-entrega (o el loopback de un
    // reembolso admin), no un pago "pendiente".
    if (payment.status === "refunded") return { result: "duplicate", orderId };

    // Transición de estado del pago (aprobación/rechazo), idempotente por status.
    const fresh = await this.repo.recordEvent(`${paymentId}:${payment.status}`, "payment", payment);
    if (!fresh) return { result: "duplicate", orderId };

    if (!orderId) return { result: "ignored", orderId };

    if (payment.status === "approved") {
      // Cobro de reagendamiento diferido: la orden de delta no tiene reserva, así
      // que NO va por confirm_payment (daría paid_no_hold). Se finaliza el movimiento;
      // si no se pudo aplicar (slot tomado, reserva cancelada o link anulado mientras
      // el cliente pagaba), se devuelve el excedente. El inbox (arriba) ya dedupea por
      // `{paymentId}:approved` → sin doble finalización.
      if (this.finalizer) {
        const charge = await this.finalizer.chargeForOrder(orderId);
        if (charge) {
          const outcome = await this.finalizer.applyCharge(orderId, paymentId);
          if (outcome === "applied") return { result: "reschedule_applied", orderId };
          if (outcome === "noop") return { result: "duplicate", orderId };
          // La reserva no se movió (slot tomado / cancelada / link anulado): devolver el delta.
          // Inbox-first como todos los reembolsos; solo `approved` se asienta. Si MP falla o
          // deja el reembolso en proceso, la orden delta queda `paid` y el cron reconcile lo
          // reintenta (retryFailedChargeRefunds) o el loopback lo asienta.
          let refund: "done" | "pending" | "failed";
          try {
            const r = await this.gateway.refundPayment(paymentId);
            if (isSettledRefund(r)) {
              await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
              await this.finalizer.markChargeRefunded(orderId, r.id);
              refund = "done";
            } else refund = "pending";
          } catch (e) {
            console.error("[webhook:charge-refund]", e);
            refund = "failed";
          }
          return { result: "reschedule_charge_failed", orderId, chargeFailure: { reason: outcome, refund } };
        }
      }

      // Inscripción de curso: su pedido tampoco tiene reserva, así que NO va por
      // confirm_payment (daría paid_no_hold: sin boleta y con el alumno en
      // silencio). Se desvía por la misma costura que el cobro de reagendamiento,
      // DESPUÉS de él: una orden de delta nunca es de curso, y así el camino ya
      // probado conserva la prioridad. El inbox de arriba ya dedupeó por
      // `{paymentId}:approved`, o sea que esto corre una sola vez.
      if (this.courseFinalizer) {
        const curso = await this.courseFinalizer.pendingCourseOrder(orderId);
        if (curso) {
          const outcome = await this.courseFinalizer.applyCoursePayment(orderId, paymentId);
          return { result: outcome === "applied" ? "course_paid" : "duplicate", orderId };
        }
      }

      // Verificar monto contra el snapshot del pedido (defensa en profundidad).
      const expected = await this.repo.getOrderAmount(orderId);
      if (expected != null && payment.amount != null && payment.amount !== expected) {
        console.error(
          `[webhook] monto no coincide: pago ${payment.amount} vs pedido ${expected} (order ${orderId})`,
        );
        return { result: "ignored", orderId };
      }
      const status = await this.repo.confirmPaid(orderId, payment);
      // `paid_no_hold`: pagó pero la reserva ya no estaba en hold → revisión del dueño.
      return { result: status === "paid_no_hold" ? "paid_unreserved" : "paid", orderId };
    }
    if (payment.status === "rejected" || payment.status === "cancelled") {
      // NO cancelar el pedido: Checkout Pro ofrece reintentar con otro medio
      // dentro del MISMO checkout (recovery de pagos rechazados), y el hold de
      // 10 min ya es la limpieza natural. Cancelar aquí liberaba el cupo en
      // pleno reintento → pago aprobado sin reserva (paid_no_hold, revisión
      // manual). Un rechazo abandonado queda igual que un checkout abandonado
      // sin intento: pendiente hasta que expire el hold.
      return { result: "rejected", orderId };
    }
    return { result: "pending", orderId };
  }
}
