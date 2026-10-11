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
  /** Solo el día sin inicios se rotula ("LLENO" / "CERRADO"); el resto, null. */
  label: "LLENO" | "CERRADO" | null;
  disabled: boolean;
}

/**
 * Una celda de la tira de días para la duración elegida. Decisión del dueño: la tira
 * NO revela cuántas horas quedan libres (ni cuenta ni "quedan pocos"); solo marca el
 * día que no tiene ningún inicio, para que no parezca un botón roto.
 */
export function stripCell(day: StartDay, durationHours: number, today: string): StripCell {
  const full = validStarts(day, durationHours).length === 0;
  return {
    date: day.date,
    dow: day.date === today ? "HOY" : dowLabel(day.weekday),
    num: day.date.slice(8, 10),
    label: day.closed ? "CERRADO" : full ? "LLENO" : null,
    disabled: full,
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

export interface HourCell {
  minute: number;
  /** Reservada, o ya pasó (hoy, antes del corte): no se puede usar. */
  occupied: boolean;
  /** Un bloque de la duración elegida cabe completo empezando aquí. */
  startable: boolean;
}

/**
 * Estado de cada hora de apertura para la grilla de /reservar. Distingue "ocupada" (se
 * tacha) de "libre, pero el bloque no cabe desde aquí" (solo deshabilitada): mezclarlas
 * hacía ver como no disponibles horas libres que una selección válida sí cubre.
 */
export function hourCells(day: StartDay, durationHours: number): HourCell[] {
  if (day.closed) return [];
  const starts = new Set(validStarts(day, durationHours));
  const cells: HourCell[] = [];
  for (let m = day.openMinute; m < day.closeMinute; m += 60) {
    const slot = { start: m, end: m + 60 };
    const occupied = m < day.minStart || day.booked.some((b) => slot.start < b.end && b.start < slot.end);
    cells.push({ minute: m, occupied, startable: starts.has(m) });
  }
  return cells;
}
