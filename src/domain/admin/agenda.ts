/**
 * Vistas del calendario de la agenda admin (puro, sin IO). El estado vive en la
 * URL (?v=&d=); acá se parsea y valida, se calculan los rangos visibles por
 * vista (día / semana / mes) y la geometría de la grilla horaria: minutos de
 * RELOJ (no transcurridos — ver `wallMinutes`), eje horario, carriles y chips.
 */
import { DateTime } from "luxon";
import type { ExceptionRow, OpeningHourRow } from "@/src/domain/analytics/metrics";
import { monthGrid, type DayCell } from "@/src/domain/scheduling/month-availability";
import { dayBoundsUtc, weekdayFor } from "@/src/domain/scheduling/time";

export const AGENDA_VIEWS = ["dia", "semana", "mes"] as const;
export type AgendaView = (typeof AGENDA_VIEWS)[number];

export interface AgendaQuery {
  view: AgendaView;
  /** Fecha ancla local "YYYY-MM-DD" (un día de la vista; la vista deriva su rango). */
  date: string;
}

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function oneOf<T extends string>(valid: readonly T[], raw: string | undefined, fallback: T): T {
  return valid.includes(raw as T) ? (raw as T) : fallback;
}

/** Fecha "YYYY-MM-DD" real y en un rango sano (evita anclas absurdas en la URL). */
function validDate(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const dt = DateTime.fromISO(raw);
  if (!dt.isValid || dt.year < 2020 || dt.year > 2100) return null;
  return raw;
}

/** `?w=` es el parámetro legado de la agenda semanal; se respeta si no hay `d`. */
export function parseAgendaSearchParams(
  sp: Record<string, string | string[] | undefined>,
  today: string,
): AgendaQuery {
  return {
    view: oneOf(AGENDA_VIEWS, first(sp.v), "semana"),
    date: validDate(first(sp.d)) ?? validDate(first(sp.w)) ?? today,
  };
}

/** Href canónico de la agenda: omite los valores por defecto (v=semana, d=hoy). */
export function agendaHref(base: AgendaQuery, patch: Partial<AgendaQuery>, today: string): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  if (merged.view !== "semana") sp.set("v", merged.view);
  if (merged.date !== today) sp.set("d", merged.date);
  const qs = sp.toString();
  return qs ? `/admin/agenda?${qs}` : "/admin/agenda";
}

/** Ancla de la vista anterior/siguiente: ±1 día / semana / mes (Luxon clampa fin de mes). */
export function shiftAnchor(q: AgendaQuery, dir: 1 | -1): string {
  const unit = q.view === "dia" ? { days: dir } : q.view === "semana" ? { weeks: dir } : { months: dir };
  return DateTime.fromISO(q.date).plus(unit).toFormat("yyyy-MM-dd");
}

export interface AgendaRange {
  /** Fechas locales visibles: 1 (día), 7 (semana, lunes primero) o 42 (mes). */
  days: string[];
  /** Solo mes: la grilla 6×7 con marca de relleno. */
  weeks?: DayCell[][];
  /** Solo mes: "YYYY-MM". */
  month?: string;
}

export function agendaRange(q: AgendaQuery): AgendaRange {
  if (q.view === "dia") return { days: [q.date] };
  if (q.view === "semana") {
    const monday = DateTime.fromISO(q.date).startOf("week"); // lunes (ISO)
    return { days: Array.from({ length: 7 }, (_, i) => monday.plus({ days: i }).toFormat("yyyy-MM-dd")) };
  }
  const weeks = monthGrid(q.date.slice(0, 7));
  return { days: weeks.flat().map((c) => c.date), weeks, month: q.date.slice(0, 7) };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Jueves 3 de julio 2026" / "29 jun – 5 jul 2026" / "Julio 2026". */
export function rangeLabel(q: AgendaQuery): string {
  const d = DateTime.fromISO(q.date).setLocale("es");
  if (q.view === "dia") return cap(d.toFormat("cccc d 'de' LLLL yyyy"));
  if (q.view === "mes") return cap(d.toFormat("LLLL yyyy"));
  const start = d.startOf("week");
  const end = start.plus({ days: 6 });
  const left = start.month === end.month ? start.toFormat("d") : start.toFormat("d LLL");
  return `${left} – ${end.toFormat("d LLL yyyy")}`;
}

/**
 * Asigna cada evento a TODOS los días visibles que solapa (un bloqueo que cruza
 * medianoche aparece en ambos días). Semántica semi-abierta [start, end): un
 * evento que termina exactamente a las 00:00 NO cae en el día siguiente.
 */
export function eventsByDay<T extends { startsAt: string; endsAt: string }>(
  days: string[],
  tz: string,
  events: T[],
): Record<string, T[]> {
  const evs = events
    .map((e) => ({ e, start: Date.parse(e.startsAt), end: Date.parse(e.endsAt) }))
    .sort((a, b) => a.start - b.start);
  const out: Record<string, T[]> = {};
  for (const day of days) {
    const { startUtc, endUtc } = dayBoundsUtc(day, tz);
    const dayStart = Date.parse(startUtc);
    const dayEnd = Date.parse(endUtc);
    out[day] = evs.filter((x) => x.start < dayEnd && x.end > dayStart).map((x) => x.e);
  }
  return out;
}

/** Ventana [open, close) local de una fecha; excepciones mandan sobre opening_hours (como analíticas). */
export function effectiveHours(
  date: string,
  tz: string,
  openingHours: OpeningHourRow[],
  exceptions: ExceptionRow[],
): [number, number] | null {
  const ex = exceptions.find((e) => e.date === date);
  if (ex) {
    if (ex.closed) return null;
    if (ex.openMinute != null && ex.closeMinute != null) return [ex.openMinute, ex.closeMinute];
  }
  const oh = openingHours.find((h) => h.weekday === weekdayFor(date, tz));
  return oh && oh.closeMinute > oh.openMinute ? [oh.openMinute, oh.closeMinute] : null;
}

/**
 * Eje horario de la grilla (día/semana): unión de los horarios efectivos de los
 * días visibles, extendida para cubrir eventos fuera de horario (bloqueos de
 * madrugada, cortesías) y alineada a la hora. Fallback sin datos: 09:00–23:00.
 */
export function axisWindow(
  openings: Array<[number, number] | null>,
  eventMinutes: Array<{ start: number; end: number }>,
): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const o of openings) {
    if (!o) continue;
    start = Math.min(start, o[0]);
    end = Math.max(end, o[1]);
  }
  for (const m of eventMinutes) {
    if (m.end <= m.start) continue;
    start = Math.min(start, m.start);
    end = Math.max(end, m.end);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { start: 540, end: 1380 };
  return { start: Math.max(0, Math.floor(start / 60) * 60), end: Math.min(1440, Math.ceil(end / 60) * 60) };
}

/**
 * Minutos de RELOJ de un instante dentro de la columna `date` (0 si cae en un
 * día anterior, 1440 si cae en uno posterior — recorte multi-día). No usar
 * `toLocalMinutesInterval` para posicionar: devuelve minutos TRANSCURRIDOS
 * desde medianoche, que en los días de cambio DST difieren ±60 del reloj y
 * desalinearían los eventos contra las etiquetas de hora del eje.
 */
export function wallMinutes(iso: string, date: string, tz: string): number {
  const dt = DateTime.fromISO(iso, { zone: tz });
  const d = dt.toISODate()!;
  if (d < date) return 0;
  if (d > date) return 1440;
  return dt.hour * 60 + dt.minute;
}

/**
 * Orden de pintado en la grilla: bloqueos primero (quedan al fondo), luego por
 * inicio y por id (determinista). Los eventos activos no se solapan entre sí
 * (constraint de exclusión en DB) — los carriles son solo defensa visual.
 */
export function gridOrder<T extends { kind: string; startsAt: string; id: string }>(events: T[]): T[] {
  return [...events].sort(
    (a, b) =>
      Number(a.kind !== "block") - Number(b.kind !== "block") ||
      a.startsAt.localeCompare(b.startsAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Carril de cada intervalo (en orden de entrada): nº de ya-colocados que solapa, tope 3. */
export function assignLanes(intervals: Array<{ start: number; end: number }>): number[] {
  const placed: Array<{ start: number; end: number }> = [];
  return intervals.map((iv) => {
    const lane = Math.min(placed.filter((p) => p.start < iv.end && iv.start < p.end).length, 3);
    placed.push(iv);
    return lane;
  });
}

/** Overflow de chips del mes: si no caben todos, la última fila se vuelve "+N más". */
export function chipSplit<T>(items: T[], max: number): { visible: T[]; hiddenCount: number } {
  if (items.length <= max) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, max - 1), hiddenCount: items.length - (max - 1) };
}
