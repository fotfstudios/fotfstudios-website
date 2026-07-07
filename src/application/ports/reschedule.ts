import type { Quote } from "@/src/domain/pricing/types";
import type { OrderLine } from "@/src/domain/pricing/order-lines";

/** Contexto de una reserva candidata a reagendar (lo arma el repo desde la DB). */
export interface RescheduleContext {
  reservation: { id: string; resourceId: string; startsAt: string; status: string; kind: string };
  /** null para bloqueos/cortesías sin orden. */
  order: {
    id: string;
    status: string;
    amountClp: number;
    refundedAmountClp: number;
    pointsRedeemedClp: number;
    mpPaymentId: string | null;
  } | null;
  /** addon_keys del pedido, para re-cotizar el nuevo horario con los mismos add-ons. */
  addonKeys: string[];
}

export interface RescheduleMoveParams {
  reservationId: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  snapshot: Quote;
  lines: OrderLine[];
  note: string | null;
}

export interface RescheduleSettleDownParams extends RescheduleMoveParams {
  refundId: string;
  refundAmount: number;
}

/** Puerto de persistencia del reagendamiento (lo satisface SupabaseRescheduleRepository). */
export interface ReschedulePort {
  loadContext(reservationId: string): Promise<RescheduleContext | null>;
  /** Mismo precio: mueve el rango + reescribe líneas (RPC reschedule_move). */
  moveEqual(p: RescheduleMoveParams): Promise<void>;
  /** Más barato: reembolso del delta + asiento, manteniendo el booking vivo (RPC reschedule_down). */
  settleDown(p: RescheduleSettleDownParams): Promise<void>;
}
