/**
 * Política de cancelación del Curso de Iniciación DJ — fuente única, pura y
 * testeable (reloj inyectable). Transcribe lo que ya está PUBLICADO en /terminos:
 *
 *   ≥ 7 días antes de la sesión 1 → reembolso del 100%
 *   < 7 días                      → sin reembolso en dinero; el cupo se traspasa
 *                                   a la siguiente generación o a un reemplazante
 *   ya iniciado                   → sin reembolso; las sesiones que falten se
 *                                   reagendan dentro de la misma generación
 *
 * Es un ACANTILADO binario, no una escalera como la de la sala (24 h/12 h): abajo
 * del corte no hay medio reembolso, hay alternativas sin dinero. Por eso vive en
 * su propio módulo en vez de sobrecargar scheduling/cancellation-policy.
 *
 * Borde INCLUSIVO en 7 días exactos: el instante límite favorece al alumno, igual
 * que en la política de la sala. La regla solo SUGIERE — el dueño puede
 * sobreescribir el monto en el admin.
 */
export const COURSE_FULL_REFUND_DAYS = 7;

/** Qué salidas tiene el alumno además (o en vez) del dinero. */
export type CourseRemedy = "refund" | "transfer" | "substitute" | "reschedule_sessions";

export interface CourseCancelTier {
  /** 1 = 100%, 0 = sin reembolso en dinero. */
  refundPct: 1 | 0;
  label: string;
  /** Días hasta la sesión 1 (negativo si ya empezó). null si no hay sesiones agendadas. */
  daysUntil: number | null;
  started: boolean;
  remedies: CourseRemedy[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días entre `now` y el inicio de la sesión 1 (negativo si ya empezó). */
export function daysUntilFirstSession(firstSessionStartsAt: string, now: Date = new Date()): number {
  return (new Date(firstSessionStartsAt).getTime() - now.getTime()) / DAY_MS;
}

export function courseCancellationPolicy(
  firstSessionStartsAt: string | null,
  now: Date = new Date(),
): CourseCancelTier {
  // Sin sesiones agendadas el curso no ha empezado ni tiene fecha: se devuelve
  // todo. Es el caso de una generación que se arma y no llega a dictarse.
  if (!firstSessionStartsAt) {
    return {
      refundPct: 1,
      label: "Sin fecha aún — reembolso total",
      daysUntil: null,
      started: false,
      remedies: ["refund", "transfer"],
    };
  }

  const days = daysUntilFirstSession(firstSessionStartsAt, now);

  if (days >= COURSE_FULL_REFUND_DAYS) {
    return {
      refundPct: 1,
      label: "Más de 7 días — reembolso total",
      daysUntil: days,
      started: false,
      remedies: ["refund", "transfer"],
    };
  }

  if (days > 0) {
    return {
      refundPct: 0,
      label: "Menos de 7 días — sin reembolso en dinero",
      daysUntil: days,
      started: false,
      remedies: ["transfer", "substitute"],
    };
  }

  return {
    refundPct: 0,
    label: "Curso iniciado — sin reembolso en dinero",
    daysUntil: days,
    started: true,
    remedies: ["reschedule_sessions"],
  };
}

/**
 * Monto sugerido a devolver. `mode` deja que el dueño sobreescriba la política
 * (cortesía, caso especial); la regla es el default, no una jaula.
 */
export function resolveCourseRefundAmount(
  mode: "policy" | "full" | "none" | "custom",
  ctx: { firstSessionStartsAt: string | null; liveAmountClp: number; customAmount?: number; now?: Date },
): number | null {
  switch (mode) {
    case "none":
      return null;
    case "full":
      return ctx.liveAmountClp;
    case "custom":
      return ctx.customAmount ?? null;
    case "policy": {
      const tier = courseCancellationPolicy(ctx.firstSessionStartsAt, ctx.now);
      return tier.refundPct === 1 ? ctx.liveAmountClp : null;
    }
  }
}
