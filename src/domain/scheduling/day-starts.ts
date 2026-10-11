/**
 * Inicios reservables por día y las etiquetas de la tira de días de /reservar.
 * Puro: recibe el día ya resuelto (minutos locales) que entrega
 * `AvailabilityService.getRangeAvailability`.
 */
import { DateTime } from "luxon";
import { availableStartMinutes, type Interval } from "./availability";

export interface StartDay {
  date: string; // "YYYY-MM-DD" local
  weekday: number; // 0=Dom … 6=Sáb
  closed: boolean;
  openMinute: number;
  closeMinute: number;
  booked: Interval[];
  /** Corte: ningún inicio antes de este minuto (hoy = ahora + anticipación; pasado = 1440). */
  minStart: number;
}

const DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MON = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** Con esta cantidad de inicios o menos, el día se marca con el acento ("quedan pocos"). */
export const LOW_STARTS = 3;

export const dowLabel = (weekday: number): string => DOW[weekday];

/** Inicios (minuto del día, en la hora) donde cabe una reserva de `durationHours`. */
export function validStarts(day: StartDay, durationHours: number): number[] {
  if (day.closed) return [];
  return availableStartMinutes(day.openMinute, day.closeMinute, durationHours, day.booked, 60, day.minStart);
}

/** Cantidad de inicios por duración, para las tarjetas "N horarios el LUN 13". */
export function startCountsByDuration(day: StartDay, durations: number[] = [1, 2, 3, 4]): Record<number, number> {
  return Object.fromEntries(durations.map((d) => [d, validStarts(day, d).length]));
}

export interface StripCell {
  date: string;
  dow: string; // "HOY" o "LUN"…
  num: string; // "07"
  free: number;
  label: string; // "N hrs" | "LLENO" | "CERRADO"
  low: boolean;
  disabled: boolean;
}

/** Una celda de la tira de días para la duración elegida. */
export function stripCell(day: StartDay, durationHours: number, today: string): StripCell {
  const free = validStarts(day, durationHours).length;
  return {
    date: day.date,
    dow: day.date === today ? "HOY" : dowLabel(day.weekday),
    num: day.date.slice(8, 10),
    free,
    label: day.closed ? "CERRADO" : free === 0 ? "LLENO" : `${free} hrs`,
    low: free > 0 && free <= LOW_STARTS,
    disabled: free === 0,
  };
}

/** "OCT 2026", "OCT — NOV 2026" o "DIC 2026 — ENE 2027" para el rango visible. */
export function monthRangeLabel(first: string, last: string): string {
  const a = DateTime.fromISO(first);
  const b = DateTime.fromISO(last);
  const mon = (d: DateTime) => MON[d.month - 1];
  if (a.year !== b.year) return `${mon(a)} ${a.year} — ${mon(b)} ${b.year}`;
  if (a.month !== b.month) return `${mon(a)} — ${mon(b)} ${a.year}`;
  return `${mon(a)} ${a.year}`;
}

/** "LUN 19 OCT" para el resumen y la barra móvil. */
export function dateShortLabel(date: string): string {
  const d = DateTime.fromISO(date);
  return `${DOW[d.weekday % 7]} ${date.slice(8, 10)} ${MON[d.month - 1]}`;
}
