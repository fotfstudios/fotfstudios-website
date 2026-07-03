/**
 * Política de cancelación — fuente única, pura y testeable (reloj inyectable).
 *
 *   ≥ 24 h de anticipación → reembolso total (100%)
 *   [12 h, 24 h)           → reembolso del 50%
 *   < 12 h, iniciada o pasada → sin reembolso
 *
 * Bordes INCLUSIVOS en 24 h y 12 h exactas: el instante límite favorece al
 * cliente. La política solo SUGIERE: el dueño puede sobreescribir en el admin.
 * Compara instantes UTC (la TZ es asunto de display, no de la regla).
 */
import { discountAmount } from "@/src/domain/money/money";

export interface RefundTier {
  pct: 1 | 0.5 | 0;
  label: string;
  hoursUntil: number;
}

export function refundPolicy(startsAt: string, now: Date = new Date()): RefundTier {
  const hoursUntil = (Date.parse(startsAt) - now.getTime()) / 3_600_000;
  if (hoursUntil >= 24) {
    return { pct: 1, label: "Reembolso total (24 h o más de anticipación)", hoursUntil };
  }
  if (hoursUntil >= 12) {
    return { pct: 0.5, label: "Reembolso del 50% (entre 12 y 24 h)", hoursUntil };
  }
  return { pct: 0, label: "Sin reembolso (menos de 12 h)", hoursUntil };
}

/** Monto sugerido en CLP entero sobre la boleta viva (total − ya reembolsado). */
export function suggestedRefund(tier: RefundTier, liveBoleta: number): number {
  if (tier.pct === 1) return liveBoleta;
  if (tier.pct === 0.5) return discountAmount(liveBoleta, 0.5);
  return 0;
}

export type RefundMode = "policy" | "full" | "none" | "custom";

/**
 * Mapea el modo elegido en el admin a un monto validado (null = sin reembolso).
 * Vive en el dominio para ser testeable: la server action queda como parser fino.
 * `policy`/`full` se calculan SIEMPRE del lado del servidor; solo `custom` trae
 * un número del cliente, acotado a [1, boleta viva].
 */
export function resolveRefundAmount(
  mode: RefundMode,
  ctx: { startsAt: string | null; liveBoleta: number; customAmount?: number; now?: Date },
): number | null {
  if (mode === "none") return null;

  if (ctx.liveBoleta <= 0) {
    throw new Error("No queda saldo por reembolsar en esta orden.");
  }

  if (mode === "full") return ctx.liveBoleta;

  if (mode === "policy") {
    if (!ctx.startsAt) throw new Error("Esta reserva no tiene un pago asociado a una sesión.");
    const amount = suggestedRefund(refundPolicy(ctx.startsAt, ctx.now), ctx.liveBoleta);
    return amount > 0 ? amount : null;
  }

  // custom
  const amount = ctx.customAmount;
  if (amount == null || !Number.isInteger(amount)) {
    throw new Error("El monto debe ser un número entero en pesos.");
  }
  if (amount < 1 || amount > ctx.liveBoleta) {
    throw new Error(`El monto debe estar entre $1 y el saldo reembolsable (${ctx.liveBoleta}).`);
  }
  return amount;
}
