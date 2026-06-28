/**
 * Estado de disponibilidad por día (para pintar el calendario) y generación de
 * la grilla mensual. Puro: la conversión de tz vive en `time.ts`.
 */
import { DateTime } from "luxon";
import { availableStartMinutes, type Interval } from "./availability";

export type DayStatus = "closed" | "full" | "low" | "open";

/** Clasifica un día por nº de inicios de 1h libres: 0→full, 1–2→low, ≥3→open. */
export function classifyDay(openMinute: number, closeMinute: number, booked: Interval[]): DayStatus {
  if (closeMinute <= openMinute) return "closed";
  const free = availableStartMinutes(openMinute, closeMinute, 1, booked).length;
  if (free === 0) return "full";
  if (free <= 2) return "low";
  return "open";
}

export interface DayCell {
  date: string; // "YYYY-MM-DD"
  inMonth: boolean; // false = relleno de un mes vecino
}

/** Grilla de 6 semanas (42 celdas), empezando en domingo, para el mes "YYYY-MM". */
export function monthGrid(month: string): DayCell[][] {
  const first = DateTime.fromISO(`${month}-01`);
  const gridStart = first.minus({ days: first.weekday % 7 }); // Luxon: 1=Lun..7=Dom → Dom=0
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = gridStart.plus({ days: w * 7 + d });
      row.push({ date: dt.toFormat("yyyy-MM-dd"), inMonth: dt.month === first.month });
    }
    weeks.push(row);
  }
  return weeks;
}
