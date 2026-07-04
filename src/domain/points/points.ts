/**
 * Puntos FOTF — matemática pura (1 punto = $1 CLP). Espejo testeable de la
 * lógica que vive en SQL (apply_points/confirm_payment/mark_refunded); un test
 * de integración verifica la paridad. NO valida saldos: la única autoridad del
 * saldo es el row lock de `create_checkout` en la base.
 */

/** Tasa de earn sobre el EFECTIVO pagado (la parte pagada con puntos no gana). */
export const EARN_RATE = 0.05;

/** Puntos ganados por un pago en efectivo. */
export function computeEarn(cash: number): number {
  return Math.floor(EARN_RATE * cash);
}

/** Earn que DEBE quedar tras reembolsos: 5% del efectivo retenido. */
export function earnTarget(cash: number, refundedTotal: number): number {
  return Math.floor(EARN_RATE * (cash - refundedTotal));
}

/** Cuánto revocar ahora para converger al objetivo (truing sin deriva). */
export function clawbackAmount(earnNet: number, cash: number, refundedTotal: number): number {
  return Math.max(0, earnNet - earnTarget(cash, refundedTotal));
}

/** Canje que DEBE estar repuesto: proporcional a la fracción reembolsada. */
export function restoreTarget(pointsRedeemed: number, cash: number, refundedTotal: number): number {
  return Math.floor((pointsRedeemed * refundedTotal) / cash);
}

/** Cuánto reponer ahora (objetivo − ya repuesto, nunca negativo). */
export function restoreAmount(target: number, restoredSoFar: number): number {
  return Math.max(0, target - restoredSoFar);
}

export interface RedemptionSplit {
  pointsApplied: number;
  cashTotal: number;
  cashNet: number;
  cashTax: number;
}

/**
 * Aplica un canje sobre el quote: capa a [0, total] y reparte net/IVA
 * proporcionales al efectivo (mismo criterio que create_boleta_amount).
 * Garantiza cash + puntos === total y net + tax === cash.
 */
export function applyRedemption(quote: { total: number; net: number }, requestedPoints: number): RedemptionSplit {
  const pointsApplied = Math.min(Math.max(0, Math.floor(requestedPoints)), quote.total);
  const cashTotal = quote.total - pointsApplied;
  const cashNet = cashTotal === 0 ? 0 : Math.round((cashTotal * quote.net) / quote.total);
  return { pointsApplied, cashTotal, cashNet, cashTax: cashTotal - cashNet };
}

/** Acota el input del widget: entero en [0, min(saldo, total)]. */
export function clampPoints(balance: number, total: number, requested: number): number {
  return Math.min(Math.max(0, Math.floor(requested)), balance, total);
}
