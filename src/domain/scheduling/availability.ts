/**
 * Disponibilidad — puro, en minutos del día. La conversión fecha/tz vive en
 * `time.ts`; aquí solo aritmética de intervalos y huecos.
 */

export interface Interval {
  start: number; // minuto del día
  end: number;
}

/** ¿Se traslapan dos intervalos? (semiabierto: fin == inicio NO choca). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Inicios válidos (en la hora exacta por defecto) para una reserva de
 * `durationHours`, dentro de [openMinute, closeMinute) y sin chocar con `booked`.
 */
export function availableStartMinutes(
  openMinute: number,
  closeMinute: number,
  durationHours: number,
  booked: Interval[],
  stepMinutes = 60,
): number[] {
  const dur = durationHours * 60;
  const out: number[] = [];
  for (let s = openMinute; s + dur <= closeMinute; s += stepMinutes) {
    const slot: Interval = { start: s, end: s + dur };
    if (!booked.some((b) => overlaps(slot, b))) out.push(s);
  }
  return out;
}
