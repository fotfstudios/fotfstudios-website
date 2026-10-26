/**
 * Práctica libre del curso: el saldo se gasta en medias horas, mínimo 1 hora por práctica
 * (1, 1,5, 2…). La DB aplica la misma regla (migración 20261026120000); esto es para el
 * admin (qué opciones ofrecer, validar antes del RPC) y para el copy.
 */
export const PRACTICE_MIN_HOURS = 1;
export const PRACTICE_STEP_HOURS = 0.5;

/** ¿`h` es una duración de práctica válida? */
export function isPracticeHours(h: number): boolean {
  return Number.isFinite(h) && h >= PRACTICE_MIN_HOURS && Number.isInteger(h / PRACTICE_STEP_HOURS);
}

/**
 * Las duraciones que se pueden elegir con `max` horas disponibles: de 1 h a `max` en pasos
 * de media hora. Con menos de 1 h disponible no hay ninguna (media hora suelta no alcanza).
 */
export function practiceDurations(max: number): number[] {
  const out: number[] = [];
  for (let h = PRACTICE_MIN_HOURS; h <= max + 1e-9; h += PRACTICE_STEP_HOURS) out.push(h);
  return out;
}

/** "1 hora", "1,5 horas", "0,5 horas": la cifra como se escribe en Chile. */
export function practiceHoursLabel(h: number): string {
  return `${h.toLocaleString("es-CL")} ${h === 1 ? "hora" : "horas"}`;
}
