/**
 * Reparte un reembolso entre los pagos que financian las boletas vivas de un pedido.
 *
 * Un pedido encarecido tiene VARIAS boletas vivas, cada una financiada por un pago MP
 * distinto (la original + la orden de delta). MP rechaza reembolsar a un pago más de lo
 * que capturó, así que el reembolso se reparte por-pago. Camina las boletas
 * MÁS-ANTIGUA-PRIMERO —el mismo orden en que `reschedule_down` / `mark_refunded`
 * emiten las NC en la DB— de modo que el dinero y el asiento contable coinciden.
 */
export interface BackingBoleta {
  /** Saldo vivo de la boleta (total − reversed_clp). */
  liveAmount: number;
  /** Pago que la financia (`settlement_order_id.mp_payment_id`); null si es offline. */
  paymentId: string | null;
}

export interface RefundAllocation {
  paymentId: string | null;
  amount: number;
}

export function splitRefundAcrossPayments(boletas: BackingBoleta[], refundAmount: number): RefundAllocation[] {
  const out: RefundAllocation[] = [];
  let remaining = refundAmount;
  for (const b of boletas) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.liveAmount);
    if (take <= 0) continue;
    // Agrega por pago: dos boletas del mismo pago colapsan en una sola devolución.
    const existing = out.find((a) => a.paymentId === b.paymentId);
    if (existing) existing.amount += take;
    else out.push({ paymentId: b.paymentId, amount: take });
    remaining -= take;
  }
  return out;
}
