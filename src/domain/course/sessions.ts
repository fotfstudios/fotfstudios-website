/**
 * Layout de las sesiones de una generación — puro, sin IO.
 *
 * La trampa de este módulo es el horario de verano. Chile cambia de hora el
 * primer domingo de septiembre (→ −03) y el primero de abril (→ −04), así que una
 * generación de 4 semanas que parta a mediados de agosto o de marzo VA a cruzar
 * una transición. Si las fechas se generan sumando 7×24 h en UTC, la mitad de las
 * sesiones queda corrida una hora: el alumno llega a las 20:00 y la sala está
 * ocupada, o peor, la sesión choca con una reserva pagada.
 *
 * Por eso la iteración es en HORA LOCAL DE PARED (`plus({ weeks })` sobre un
 * DateTime zonificado) y recién después cada sesión se convierte a UTC con
 * `rangeFor`. Luxon resuelve el offset de cada fecha por separado.
 */
import { DateTime } from "luxon";
import { rangeFor } from "@/src/domain/scheduling/time";

export interface CourseSessionPlan {
  n: number;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface SessionLayoutInput {
  /** Fecha local de la primera sesión (YYYY-MM-DD). */
  firstDate: string;
  /** Minuto del día en que empieza cada sesión (hora local). */
  startMinute: number;
  durationHours: number;
  /** Títulos por sesión; su largo define cuántas sesiones se agendan. */
  titles: readonly string[];
  /** Semanas entre sesiones (1 = semanal). */
  everyWeeks?: number;
  tz: string;
}

/**
 * Expande la grilla semanal. Devuelve una sesión por título, numeradas desde 1.
 * Todas caen al MISMO reloj de pared aunque el rango cruce un cambio de hora.
 */
export function planSessions(input: SessionLayoutInput): CourseSessionPlan[] {
  const { firstDate, startMinute, durationHours, titles, tz } = input;
  const everyWeeks = input.everyWeeks ?? 1;

  const first = DateTime.fromISO(firstDate, { zone: tz });
  if (!first.isValid) throw new Error("curso_bad_date");

  return titles.map((title, i) => {
    // La suma es en el calendario local, no en milisegundos: eso es lo que
    // preserva la hora de pared a través del cambio de horario.
    const date = first.plus({ weeks: i * everyWeeks }).toISODate()!;
    const { startsAt, endsAt } = rangeFor(date, startMinute, durationHours, tz);
    return { n: i + 1, title, startsAt, endsAt };
  });
}

/**
 * ¿Se pisan dos sesiones del mismo plan? Se valida ANTES de tocar la DB: el
 * EXCLUDE gist compara filas distintas, así que un plan que se auto-solapa
 * fallaría recién en la segunda inserción, ya con la primera escrita y el error
 * apuntando a la sesión equivocada.
 */
export function selfOverlap(plan: readonly CourseSessionPlan[]): CourseSessionPlan | null {
  const sorted = [...plan].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsAt < sorted[i - 1].endsAt) return sorted[i];
  }
  return null;
}
