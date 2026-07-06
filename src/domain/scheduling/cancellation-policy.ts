/**
 * Política de cancelación y reagendamiento — fuente única, pura y testeable
 * (reloj inyectable).
 *
 * Reembolso al cancelar:
 *   ≥ 24 h de anticipación → reembolso total (100%)
 *   [12 h, 24 h)           → reembolso del 50%
 *   < 12 h, iniciada o pasada → sin reembolso
 *
 * Reagendamiento (mover la sesión sin devolver dinero):
 *   ≥ 12 h de anticipación → reagendar sin costo
 *   < 12 h, iniciada o pasada → no se puede reagendar
 *
 * El corte de 12 h es común: por debajo de él NI hay reembolso NI se reagenda.
 * Reagendar es más flexible que reembolsar porque el dinero no sale del negocio,
 * solo se mueve el horario.
 *
 * Bordes INCLUSIVOS en 24 h y 12 h exactas: el instante límite favorece al
 * cliente. La política solo SUGIERE: el dueño puede sobreescribir en el admin.
 * Compara instantes UTC (la TZ es asunto de display, no de la regla).
 */
import { discountAmount } from "@/src/domain/money/money";

/** Umbrales de anticipación (horas) — compartidos por reembolso y reagendamiento. */
const FULL_REFUND_HOURS = 24;
const HALF_REFUND_HOURS = 12;
/** Reagendar es gratis mientras la cancelación aún tendría reembolso (mismo corte que el 50%). */
const RESCHEDULE_MIN_HOURS = HALF_REFUND_HOURS;

/** Horas entre `now` y el inicio de la sesión (negativo si ya empezó/pasó). */
function hoursUntilStart(startsAt: string, now: Date): number {
  return (Date.parse(startsAt) - now.getTime()) / 3_600_000;
}

export interface RefundTier {
  pct: 1 | 0.5 | 0;
  label: string;
  hoursUntil: number;
}

export function refundPolicy(startsAt: string, now: Date = new Date()): RefundTier {
  const hoursUntil = hoursUntilStart(startsAt, now);
  if (hoursUntil >= FULL_REFUND_HOURS) {
    return { pct: 1, label: "Reembolso total (24 h o más de anticipación)", hoursUntil };
  }
  if (hoursUntil >= HALF_REFUND_HOURS) {
    return { pct: 0.5, label: "Reembolso del 50% (entre 12 y 24 h)", hoursUntil };
  }
  return { pct: 0, label: "Sin reembolso (menos de 12 h)", hoursUntil };
}

export interface RescheduleDecision {
  allowed: boolean;
  label: string;
  hoursUntil: number;
}

/**
 * ¿Puede el cliente reagendar sin costo? Regla por anticipación (sin límite de
 * veces): ≥ 12 h sí, por debajo no. El admin puede reagendar igual manualmente.
 */
export function reschedulePolicy(startsAt: string, now: Date = new Date()): RescheduleDecision {
  const hoursUntil = hoursUntilStart(startsAt, now);
  if (hoursUntil >= RESCHEDULE_MIN_HOURS) {
    return {
      allowed: true,
      label: "Reagendamiento sin costo (12 h o más de anticipación)",
      hoursUntil,
    };
  }
  return { allowed: false, label: "Sin reagendamiento (menos de 12 h)", hoursUntil };
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
