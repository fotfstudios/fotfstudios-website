import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";

/** Repo mínimo que la cancelación necesita (lo satisface SupabaseAdminRepository). */
export interface RefundBookingRepo {
  orderForReservation(reservationId: string): Promise<{
    orderId: string;
    status: string;
    mpPaymentId: string | null;
    amountClp: number;
    refundedAmountClp: number;
    startsAt: string | null;
  } | null>;
  /** Cancelación SIN reembolso (los reembolsos pasan por `mark_refunded`). */
  cancelBooking(reservationId: string): Promise<void>;
}

/**
 * Inbox compartido con el webhook: la MISMA idempotencia por `refund:{id}`.
 * Registrar el reembolso aquí ANTES de `mark_refunded` es lo que evita la NC
 * duplicada cuando MP dispara el webhook loopback del reembolso que nosotros
 * mismos iniciamos (`mark_refunded` NO es idempotente por refund id).
 */
export type RefundInbox = Pick<PaymentNotificationRepository, "recordEvent" | "markRefunded">;

/** Un `mp_payment_id` es reembolsable en MP si existe y no es un pago offline. */
function isRealMpPayment(id: string | null): id is string {
  return !!id && !id.startsWith("offline:");
}

/**
 * Cancela una reserva con reembolso opcional (total o PARCIAL) en Mercado Pago.
 * Postgres no puede llamar a MP, así que el reembolso ocurre aquí (capa app)
 * ANTES del asiento en la DB: si MP falla, se aborta y nada cambia.
 *
 * Contabilidad: todo reembolso pasa por `mark_refunded` (capa al saldo de la
 * boleta viva, cancela la reserva, acumula `refunded_amount_clp`, NC por la
 * boleta viva + boleta nueva por el saldo retenido). Invariante: reembolso ⇒
 * reserva cancelada + horario liberado.
 */
export class RefundService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repo: RefundBookingRepo,
    private readonly inbox: RefundInbox,
  ) {}

  async cancelBooking(
    reservationId: string,
    opts: { refundAmount: number | null },
  ): Promise<{ alreadyProcessed: boolean }> {
    // Sin reembolso: cancelación simple (orden pagada queda 'paid'; no pagada → 'cancelled').
    if (opts.refundAmount == null) {
      await this.repo.cancelBooking(reservationId);
      return { alreadyProcessed: false };
    }

    const target = await this.repo.orderForReservation(reservationId);
    if (!target) {
      throw new Error("Esta reserva no tiene un pago asociado. Usa 'Cancelar sin reembolso'.");
    }
    if (target.status !== "paid") {
      throw new Error(
        `No se puede reembolsar: el pedido no está pagado (estado: ${target.status}). Cancela sin reembolso.`,
      );
    }
    const liveBoleta = target.amountClp - target.refundedAmountClp;
    if (opts.refundAmount < 1 || opts.refundAmount > liveBoleta) {
      throw new Error(`El monto excede el saldo reembolsable ($${liveBoleta}).`);
    }

    // Pago offline (efectivo/transferencia): sin MP y SIN inbox (la clave
    // `refund:offline:manual` no es única y no existe loopback). La devolución
    // física la hace el dueño; aquí queda el asiento (NC + saldo).
    if (!isRealMpPayment(target.mpPaymentId)) {
      await this.inbox.markRefunded(target.orderId, "offline:manual", opts.refundAmount);
      return { alreadyProcessed: false };
    }

    // MP real: monto SIEMPRE explícito (idempotency key por monto; MP rechaza
    // sobre-reembolsos). Si lanza, se aborta con la DB intacta.
    const refund = await this.gateway.refundPayment(target.mpPaymentId, opts.refundAmount);

    // Inbox PRIMERO (dedupe contra el webhook loopback), luego el asiento.
    const fresh = await this.inbox.recordEvent(`refund:${refund.id}`, "refund", refund);
    if (!fresh) {
      // El loopback ganó la carrera (p. ej. reintento tras un corte): ya está asentado.
      return { alreadyProcessed: true };
    }
    await this.inbox.markRefunded(target.orderId, refund.id, opts.refundAmount);
    return { alreadyProcessed: false };
  }
}
