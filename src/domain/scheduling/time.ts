/**
 * Tiempo y zona horaria — Luxon detrás de una API mínima. Convierte fecha local
 * + minutos del día (en la tz de la locación) a instantes UTC, y deriva el día
 * de semana. Maneja DST automáticamente.
 */
import { DateTime } from "luxon";

/** Día de semana 0..6 (0=Dom … 6=Sáb, como Date.getDay) para una fecha local. */
export function weekdayFor(date: string, tz: string): number {
  return DateTime.fromISO(date, { zone: tz }).weekday % 7; // Luxon: 1=Lun..7=Dom
}

/** Instante UTC (ISO) de una fecha local + minuto del día en `tz`. */
export function instantFor(date: string, minuteOfDay: number, tz: string): string {
  return DateTime.fromISO(date, { zone: tz })
    .startOf("day")
    .plus({ minutes: minuteOfDay })
    .toUTC()
    .toISO()!;
}

/** Rango [startsAt, endsAt) en UTC para una reserva de `durationHours`. */
export function rangeFor(
  date: string,
  startMinute: number,
  durationHours: number,
  tz: string,
): { startsAt: string; endsAt: string } {
  const start = DateTime.fromISO(date, { zone: tz }).startOf("day").plus({ minutes: startMinute });
  const end = start.plus({ hours: durationHours });
  return { startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()! };
}
