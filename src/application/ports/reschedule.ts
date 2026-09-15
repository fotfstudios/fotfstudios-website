import type { Quote } from "@/src/domain/pricing/types";
import type { OrderLine } from "@/src/domain/pricing/order-lines";
import type { BackingBoleta } from "@/src/domain/scheduling/refund-split";

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
  /**
   * Descuento manual vigente en el pedido, en pesos positivos (0 = ninguno).
   * El motor no lo conoce —no es parte del price book—, así que sin arrastrarlo
   * la re-cotización le cobra al cliente la concesión que ya se le había dado.
   */
  concessionClp: number;
  /** Glosa de esa concesión, para la línea nueva y para mostrarla al staff. */
  concessionLabel: string;
  /** Zona horaria de la sala — para armar el rango destino sin cotizar (cortesías). */
  timezone: string;
  /**
   * Fila `pending_charge`/`pending_refund` viva de esta reserva, si la hay. El índice único
   * parcial garantiza a lo más una — con ella presente NO se cotiza ni se mueve: hay que
   * anularla (o esperar a que se pague) antes de reagendar de nuevo.
   */
  pending: {
    kind: "charge" | "refund";
    rescheduleId: string;
    deltaOrderId: string | null;
    amountClp: number;
    newStartsAt: string;
    newEndsAt: string;
  } | null;
}

export interface RescheduleMoveParams {
  reservationId: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  snapshot: Quote;
  lines: OrderLine[];
  note: string | null;
}

/** Más barato: mueve SIN plata y abre la fila `pending_refund` con el delta a devolver. */
export interface RescheduleMoveDownParams extends RescheduleMoveParams {
  refundAmount: number;
  createdBy?: string | null;
}

export interface RescheduleChargeParams extends RescheduleMoveParams {
  delta: number;
  deltaNet: number;
  deltaTax: number;
  createdBy?: string | null;
}

/**
 * Resultado de `reschedule_settle_refund`: `settled` = parcial (falta plata), `applied` = la
 * fila quedó completa, `duplicate` = ese refund id ya se asentó (loopback), `cancelled` = la
 * reserva se canceló con el reembolso en vuelo (la plata igual salió: se asienta sobre la orden
 * cancelada), `noop` = no hay nada que asentar (fila inexistente, ya applied con otro id, o
 * monto 0) — NUNCA autoriza cancelar nada.
 */
export type SettleOutcome = "settled" | "applied" | "duplicate" | "cancelled" | "noop";

/** Fila `pending_refund` viva: cuánto se debe, cuánto ya se asentó y el reembolso MP en vuelo (si hay). */
export interface PendingRefundRow {
  rescheduleId: string;
  orderId: string;
  reservationId: string;
  deltaClp: number;
  settledClp: number;
  /** Parte de `settledClp` devuelta en mano (asientos `offline:*`) — la ficha la muestra aparte. */
  offlineSettledClp: number;
  inFlight: { paymentId: string; refundId: string } | null;
}

/** Puerto de persistencia del reagendamiento (lo satisface SupabaseRescheduleRepository). */
export interface ReschedulePort {
  loadContext(reservationId: string): Promise<RescheduleContext | null>;
  /** Mismo precio: mueve el rango + reescribe líneas (RPC reschedule_move). */
  moveEqual(p: RescheduleMoveParams): Promise<void>;
  /** Más barato: mueve sin plata y deja la fila pending_refund (RPC reschedule_down_move). */
  moveDown(p: RescheduleMoveDownParams): Promise<{ rescheduleId: string }>;
  /** Asienta UN reembolso aprobado sobre la fila pending_refund (RPC reschedule_settle_refund). */
  settleRefund(rescheduleId: string, refundId: string, amount: number): Promise<SettleOutcome>;
  /** Deja constancia del reembolso MP en vuelo (in_process) sobre la fila; null lo borra. */
  markRefundInFlight(rescheduleId: string, ref: { paymentId: string; refundId: string } | null): Promise<void>;
  /** Fila pending_refund por id; null si ya no está pendiente. */
  pendingRefundRow(rescheduleId: string): Promise<PendingRefundRow | null>;
  /**
   * Lease de 5 min sobre la fila pending_refund (`refund_attempt_at`): true si ESTE emisor la
   * tomó (nadie más la tiene, o el lease anterior venció). Serializa admin/cron concurrentes:
   * dos emisores que reparten sobre snapshots distintos de boletas arman claves distintas y
   * MP devolvería dos veces.
   */
  claimRefundAttempt(rescheduleId: string): Promise<boolean>;
  /** Suelta el lease (siempre, al terminar el intento — MP en vuelo es otra marca). */
  releaseRefundAttempt(rescheduleId: string): Promise<void>;
  /** Ids de filas pending_refund más viejas que la ventana (cron de reintento). */
  pendingRefundIds(opts: { olderThanMinutes: number }): Promise<string[]>;
  /** Cobros no aplicados cuyo delta se capturó en MP y nunca se devolvió (H9). */
  unrefundedFailedCharges(): Promise<{ rescheduleId: string; deltaOrderId: string; paymentId: string }[]>;
  /** Boletas vivas + su pago (más-antigua-primero) para repartir el reembolso por-pago. */
  backingBoletas(orderId: string): Promise<BackingBoleta[]>;
  /** Más caro: crea la orden de delta + fila pending_charge, SIN mover (RPC create_reschedule_charge). */
  createCharge(p: RescheduleChargeParams): Promise<{ rescheduleId: string; deltaOrderId: string }>;
  /** Anula el cobro pendiente de un reagendamiento (RPC cancel_reschedule_charge), liberando la reserva para reagendar de nuevo. */
  cancelCharge(rescheduleId: string, createdBy: string | null): Promise<boolean>;
  /** Cortesía (sin orden): movimiento puro de calendario (RPC reschedule_courtesy). */
  moveCourtesy(p: { reservationId: string; startsAt: string; endsAt: string; note: string | null }): Promise<void>;
}

/** Resultado de aplicar un cobro de reagendamiento diferido (RPC apply_reschedule_charge). */
export type ApplyChargeOutcome = "applied" | "slot_taken" | "reservation_gone" | "charge_void" | "noop";

/**
 * Lado webhook: finaliza un cobro diferido (RPC apply_reschedule_charge) y asienta el
 * loopback de un reembolso pendiente (RPC reschedule_settle_refund) en vez de cancelar.
 */
export interface RescheduleFinalizer {
  /** Fila de cobro (pendiente, anulada o expirada) cuya orden delta es `orderId`; null si no es un cobro. */
  chargeForOrder(orderId: string): Promise<{ deltaOrderId: string; rescheduleId: string } | null>;
  applyCharge(deltaOrderId: string, paymentId: string): Promise<ApplyChargeOutcome>;
  /** Reembolsa el asiento del delta cuando el cobro no se aplicó (mark_refunded sobre la orden de delta). */
  markChargeRefunded(deltaOrderId: string, refundId: string): Promise<void>;
  /**
   * Fila pending_refund de la reserva a la que pertenece `orderId` (original o delta), vía
   * reservation_for_order. `remainingClp` = delta − asentado: el webhook solo asienta un
   * reembolso que quepa ahí; uno mayor es otra cosa (reembolso total desde el panel).
   * Dependencia de orden con RescheduleService: el webhook es inbox-first, así que si el
   * loopback asienta por acá, el asiento del admin del mismo refund id llega con el inbox NO
   * fresco (y `duplicate` del RPC) — nunca cae en `mark_refunded`, que cancelaría una
   * reserva confirmada.
   */
  pendingRefundForOrder(orderId: string): Promise<{ rescheduleId: string; originalOrderId: string; remainingClp: number } | null>;
  /**
   * Asienta el reembolso sobre la fila pending_refund en vez de cancelar (RPC
   * reschedule_settle_refund; `duplicate` se evalúa antes que el estado, así el último
   * split asentado por el loopback no se lee como "reserva cancelada").
   */
  settleRefund(rescheduleId: string, refundId: string, amount: number): Promise<SettleOutcome>;
}
