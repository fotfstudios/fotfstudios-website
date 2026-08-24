import type { PaymentGateway } from "@/src/application/ports/payment";
import type { CourseFinalizer } from "@/src/application/ports/course";
import type { RescheduleFinalizer } from "@/src/application/ports/reschedule";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

export type WebhookOutcome =
  | "paid"
  | "paid_unreserved"
  | "rejected"
  | "refunded"
  | "pending"
  | "duplicate"
  | "ignored"
  | "reschedule_applied"
  | "reschedule_slot_taken"
  | "course_paid";

export interface WebhookResult {
  result: WebhookOutcome;
  orderId: string | null;
  /** Suma de los reembolsos FRESCOS procesados (solo cuando result === "refunded"). */
  refundedAmount?: number;
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
    let refundedAmount = 0;
    for (const r of payment.refunds ?? []) {
      const freshRefund = await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
      if (freshRefund && orderId) {
        await this.repo.markRefunded(orderId, r.id, r.amount);
        refunded = true;
        refundedAmount += r.amount;
      }
    }
    if (refunded) return { result: "refunded", orderId, refundedAmount };

    // Transición de estado del pago (aprobación/rechazo), idempotente por status.
    const fresh = await this.repo.recordEvent(`${paymentId}:${payment.status}`, "payment", payment);
    if (!fresh) return { result: "duplicate", orderId };

    if (!orderId) return { result: "ignored", orderId };

    if (payment.status === "approved") {
      // Cobro de reagendamiento diferido: la orden de delta no tiene reserva, así
      // que NO va por confirm_payment (daría paid_no_hold). Se finaliza el movimiento;
      // si el slot fue tomado mientras el cliente pagaba, se devuelve el excedente.
      // El inbox (arriba) ya dedupea por `{paymentId}:approved` → sin doble finalización.
      if (this.finalizer) {
        const pend = await this.finalizer.pendingChargeForOrder(orderId);
        if (pend) {
          const outcome = await this.finalizer.applyCharge(orderId, paymentId);
          if (outcome === "slot_taken") {
            const r = await this.gateway.refundPayment(paymentId);
            // Inbox-first (como todos los demás caminos de reembolso): la creación del
            // reembolso dispara su propia notificación MP; sin esto, la re-entrega vería
            // el refund como fresco y emitiría una NC espuria de $0 sobre la orden de delta.
            await this.repo.recordEvent(`refund:${r.id}`, "refund", r);
            await this.finalizer.markChargeRefunded(orderId, r.id);
            return { result: "reschedule_slot_taken", orderId };
          }
          return { result: outcome === "applied" ? "reschedule_applied" : "duplicate", orderId };
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
