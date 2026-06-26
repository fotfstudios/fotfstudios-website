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

/** Límites UTC [inicio, fin) del día local `date` en `tz`. */
export function dayBoundsUtc(date: string, tz: string): { startUtc: string; endUtc: string } {
  const start = DateTime.fromISO(date, { zone: tz }).startOf("day");
  return { startUtc: start.toUTC().toISO()!, endUtc: start.plus({ days: 1 }).toUTC().toISO()! };
}

/**
 * Convierte un rango UTC a minutos del día local `date` (recortado a [0,1440]).
 * Sirve para mapear reservas (guardadas en UTC) a la grilla del día.
 */
export function toLocalMinutesInterval(
  date: string,
  tz: string,
  startsAtISO: string,
  endsAtISO: string,
): { start: number; end: number } {
  const dayStart = DateTime.fromISO(date, { zone: tz }).startOf("day");
  const start = Math.max(
    0,
    Math.round(DateTime.fromISO(startsAtISO).setZone(tz).diff(dayStart, "minutes").minutes),
  );
  const end = Math.min(
    1440,
    Math.round(DateTime.fromISO(endsAtISO).setZone(tz).diff(dayStart, "minutes").minutes),
  );
  return { start, end };
}
