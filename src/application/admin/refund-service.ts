import type { PaymentGateway } from "@/src/application/ports/payment";

/** Repo mínimo que el reembolso necesita (lo satisface SupabaseAdminRepository). */
export interface RefundBookingRepo {
  orderForReservation(
    reservationId: string,
  ): Promise<{ orderId: string; status: string; mpPaymentId: string | null } | null>;
  cancelBooking(reservationId: string, refundId: string | null): Promise<void>;
}

/** Un `mp_payment_id` es reembolsable en MP si existe y no es un pago offline. */
function isRealMpPayment(id: string | null): id is string {
  return !!id && !id.startsWith("offline:");
}

/**
 * Orquesta la cancelación de una reserva con reembolso opcional en Mercado Pago.
 * Postgres no puede llamar a MP, así que el reembolso ocurre aquí (capa app)
 * ANTES del asiento en la DB: si MP falla, se aborta y nada cambia.
 */
export class RefundService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly repo: RefundBookingRepo,
  ) {}

  async cancelBooking(reservationId: string, opts: { refund: boolean }): Promise<void> {
    const target = await this.repo.orderForReservation(reservationId);

    // Solo reembolsamos si se pidió y la orden está efectivamente pagada.
    if (opts.refund && target?.status === "paid") {
      if (isRealMpPayment(target.mpPaymentId)) {
        // Si esto lanza, la cancelación se aborta (la DB queda intacta).
        const refund = await this.gateway.refundPayment(target.mpPaymentId);
        await this.repo.cancelBooking(reservationId, refund.id);
      } else {
        // Pago offline (efectivo/transferencia): sin llamada a MP, pero sí NC.
        await this.repo.cancelBooking(reservationId, "offline:manual");
      }
      return;
    }

    // Cancelación sin reembolso, o reserva no pagada / bloqueo.
    await this.repo.cancelBooking(reservationId, null);
  }
}
