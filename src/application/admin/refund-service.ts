import type { PaymentGateway } from "@/src/application/ports/payment";
import type { PaymentNotificationRepository } from "@/src/application/ports/webhook";
import { splitRefundAcrossPayments, type BackingBoleta } from "@/src/domain/scheduling/refund-split";

/** Repo mínimo que la cancelación necesita (lo satisface SupabaseAdminRepository). */
export interface RefundBookingRepo {
  orderForReservation(reservationId: string): Promise<{
    orderId: string;
    status: string;
    mpPaymentId: string | null;
    amountClp: number;
    refundedAmountClp: number;
    pointsRedeemedClp: number;
    startsAt: string | null;
  } | null>;
  /** Boletas vivas + su pago (más-antigua-primero) para repartir el reembolso por-pago. */
  backingBoletas(orderId: string): Promise<BackingBoleta[]>;
  /** Cancelación SIN reembolso (los reembolsos pasan por `mark_refunded`). */
  cancelBooking(reservationId: string): Promise<void>;
  /** Orden 100% puntos: cancela + repone puntos (sin MP, sin boleta/NC). */
  refundPointsOrder(orderId: string, restorePoints: number): Promise<void>;
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

    // Orden 100% puntos (efectivo $0): no hay nada que devolver por MP ni boleta
    // que anular — el "reembolso" es reponer puntos (monto en puntos, 0..P).
    if (target.amountClp === 0 && target.pointsRedeemedClp > 0) {
      if (opts.refundAmount < 0 || opts.refundAmount > target.pointsRedeemedClp) {
        throw new Error(`El monto excede los puntos reponibles (${target.pointsRedeemedClp} puntos).`);
      }
      await this.repo.refundPointsOrder(target.orderId, opts.refundAmount);
      return { alreadyProcessed: false };
    }

    const liveBoleta = target.amountClp - target.refundedAmountClp;
    if (opts.refundAmount < 1 || opts.refundAmount > liveBoleta) {
      throw new Error(`El monto excede el saldo reembolsable ($${liveBoleta}).`);
    }

    // Reembolso POR-PAGO: un pedido encarecido tiene boletas de distintos pagos MP
    // (original + orden de delta). MP rechaza devolver a un pago más de lo que capturó,
    // así que se reparte el monto por-pago, más-antigua-primero (el mismo orden en que
    // `mark_refunded` anula las boletas en la DB → dinero y asiento coinciden).
    const splits = splitRefundAcrossPayments(await this.repo.backingBoletas(target.orderId), opts.refundAmount);

    // Todo offline (efectivo/transferencia): sin MP y SIN inbox. La devolución física
    // la hace el dueño; aquí queda el asiento (NC por boleta + saldo).
    if (!splits.some((s) => isRealMpPayment(s.paymentId))) {
      await this.inbox.markRefunded(target.orderId, "offline:manual", opts.refundAmount);
      return { alreadyProcessed: false };
    }

    // Hay pago(s) MP real(es): devolver cada uno contra SU pago (monto explícito;
    // idempotency key por monto). La porción offline la devuelve el dueño. Si MP lanza,
    // se aborta con la DB intacta (el asiento va después).
    let primaryRefundId: string | null = null;
    for (const s of splits) {
      if (!isRealMpPayment(s.paymentId)) continue;
      const refund = await this.gateway.refundPayment(s.paymentId, s.amount);
      // Inbox PRIMERO (dedupe contra el webhook loopback de cada reembolso).
      const fresh = await this.inbox.recordEvent(`refund:${refund.id}`, "refund", refund);
      if (!fresh) return { alreadyProcessed: true };
      primaryRefundId = primaryRefundId ?? refund.id;
    }
    // El asiento (mark_refunded) anula las boletas por-pago y acumula el reembolso.
    await this.inbox.markRefunded(target.orderId, primaryRefundId ?? "offline:manual", opts.refundAmount);
    return { alreadyProcessed: false };
  }
}
