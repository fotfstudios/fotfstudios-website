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
  /** Zona horaria de la sala — para armar el rango destino sin cotizar (cortesías). */
  timezone: string;
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
  refundId: string | null;
  refundAmount: number;
}

export interface RescheduleChargeParams extends RescheduleMoveParams {
  delta: number;
  deltaNet: number;
  deltaTax: number;
  createdBy?: string | null;
}

/** Puerto de persistencia del reagendamiento (lo satisface SupabaseRescheduleRepository). */
export interface ReschedulePort {
  loadContext(reservationId: string): Promise<RescheduleContext | null>;
  /** Mismo precio: mueve el rango + reescribe líneas (RPC reschedule_move). */
  moveEqual(p: RescheduleMoveParams): Promise<void>;
  /** Más barato: reembolso del delta + asiento, manteniendo el booking vivo (RPC reschedule_down). */
  settleDown(p: RescheduleSettleDownParams): Promise<void>;
  /** Fija el mp_refund_id en la orden tras un reembolso MP exitoso (post-siembra). */
  setRefundId(orderId: string, refundId: string): Promise<void>;
  /** Más caro: crea la orden de delta + fila pending_charge, SIN mover (RPC create_reschedule_charge). */
  createCharge(p: RescheduleChargeParams): Promise<{ rescheduleId: string; deltaOrderId: string }>;
  /** Cortesía (sin orden): movimiento puro de calendario (RPC reschedule_courtesy). */
  moveCourtesy(p: { reservationId: string; startsAt: string; endsAt: string; note: string | null }): Promise<void>;
}

/** Finaliza un cobro de reagendamiento diferido desde el webhook (RPC apply_reschedule_charge). */
export interface RescheduleFinalizer {
  /** ¿La orden es un cobro de reagendamiento pendiente? (para desviar del confirm normal). */
  pendingChargeForOrder(orderId: string): Promise<{ deltaOrderId: string; rescheduleId: string } | null>;
  applyCharge(deltaOrderId: string, paymentId: string): Promise<"applied" | "slot_taken" | "noop">;
  /** Reembolsa el asiento del delta cuando el slot fue tomado (mark_refunded sobre la orden de delta). */
  markChargeRefunded(deltaOrderId: string, refundId: string): Promise<void>;
}
