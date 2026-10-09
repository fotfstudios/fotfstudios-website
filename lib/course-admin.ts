/**
 * Reglas puras del admin del curso 1:1: validan lo que llega de un FormData y
 * traducen los errores de los RPC a frases para el dueño. En `lib/` para que
 * vitest las cubra — las server actions de `app/` solo las llaman.
 */
import { DateTime } from "luxon";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { err, ok, type Result } from "@/src/domain/shared/result";

const STEP = 30;
const FIRST_START = 9 * 60;
/** Última hora de inicio: una sesión de 90 min a las 22:30 termina a medianoche. */
const LAST_START = 24 * 60 - COURSE_PROGRAM.sessionMinutes;
const MAX_INSTRUCTOR = 60;

/** Horas de inicio ofrecidas en los selectores (minutos del día), cada media hora. */
export function halfHourStarts(): number[] {
  const out: number[] = [];
  for (let m = FIRST_START; m <= LAST_START; m += STEP) out.push(m);
  return out;
}

function parseDate(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid ? v : null;
}

function parseStart(v: string): number | null {
  const n = Number(v);
  return v !== "" && Number.isInteger(n) && n >= 0 && n <= LAST_START && n % STEP === 0 ? n : null;
}

export function parseProgramSchedule(raw: {
  firstDate: string;
  startMinute: string;
  everyWeeks: string;
}): Result<{ firstDate: string; startMinute: number; everyWeeks: 1 | 2 }> {
  const firstDate = parseDate(raw.firstDate);
  if (!firstDate) return err("Fecha inválida.");
  const startMinute = parseStart(raw.startMinute);
  if (startMinute === null) return err("Hora inválida.");
  const everyWeeks = Number(raw.everyWeeks);
  if (everyWeeks !== 1 && everyWeeks !== 2) return err("Frecuencia inválida: semanal o cada dos semanas.");
  return ok({ firstDate, startMinute, everyWeeks });
}

export function parseSessionMove(raw: { date: string; startMinute: string }): Result<{ date: string; startMinute: number }> {
  const date = parseDate(raw.date);
  if (!date) return err("Fecha inválida.");
  const startMinute = parseStart(raw.startMinute);
  if (startMinute === null) return err("Hora inválida.");
  return ok({ date, startMinute });
}

/** Número de sesión del programa (1..6), tal como llega del formulario. */
export function parseSessionNumber(raw: string): Result<number> {
  const n = Number(raw);
  return raw !== "" && Number.isInteger(n) && n >= 1 && n <= COURSE_PROGRAM.sessions ? ok(n) : err("Sesión inválida.");
}

/** Texto libre; vacío = sin instructor asignado. */
export function parseInstructor(raw: string): Result<string | null> {
  const v = raw.trim();
  if (!v) return ok(null);
  if (v.length > MAX_INSTRUCTOR) return err(`Instructor: máximo ${MAX_INSTRUCTOR} caracteres.`);
  return ok(v);
}

/** Errores de agendar la grilla (RPC o dominio) → frase para el dueño, nunca el código crudo. */
export function courseScheduleError(raw: string): string {
  const slot = /curso_slot_taken:(\d+)/.exec(raw);
  if (slot) return `La sesión ${slot[1]} choca con otra reserva o bloqueo. No se agendó ninguna.`;
  const past = /curso_in_past:(\d+)/.exec(raw);
  if (past) return `La sesión ${past[1]} queda en el pasado.`;
  const already = /curso_session_already_scheduled:(\d+)/.exec(raw);
  if (already) return `La sesión ${already[1]} ya está agendada: usa Editar para moverla.`;
  if (/curso_already_scheduled/.test(raw)) return "Este programa ya tiene sus sesiones agendadas.";
  if (/curso_fuera_de_ventana/.test(raw)) {
    return `La última sesión queda fuera de las ${COURSE_PROGRAM.windowWeeks} semanas del curso.`;
  }
  if (/curso_generation_not_schedulable/.test(raw)) return "Este programa ya no está activo.";
  return "No se pudieron agendar las sesiones.";
}

/**
 * Errores de mover una hora de práctica (RPC `move_practice_reservation`). Cualquier otro
 * texto (red, Postgres) cae en el genérico: nunca se muestra crudo.
 */
export function practiceMoveError(raw: string): string {
  if (/practica_slot_taken/.test(raw)) return "Ese horario choca con otra reserva o bloqueo.";
  if (/practica_en_pasado/.test(raw)) return "Ese horario ya pasó.";
  if (/practica_mismo_horario/.test(raw)) return "La práctica ya está en ese horario.";
  if (/practica_vencida/.test(raw)) return "Ese día queda fuera del plazo de las horas de práctica.";
  if (/practica_no_elegible/.test(raw)) return "La inscripción ya no está pagada: no se puede mover la práctica.";
  if (/practica_no_movible/.test(raw)) return "Esta práctica ya no se puede mover (está cancelada).";
  return "No se pudo mover la práctica.";
}

/** Errores de mover / re-agendar una sesión. */
export function courseMoveError(raw: string): string {
  if (/curso_slot_taken/.test(raw)) return "Ese horario choca con otra reserva o bloqueo.";
  if (/curso_in_past/.test(raw)) return "Ese horario ya pasó.";
  if (/curso_session_unscheduled/.test(raw)) return "Esa sesión ya no se puede mover.";
  if (/curso_generation_not_schedulable/.test(raw)) return "Este programa ya no está activo.";
  return "No se pudo mover la sesión.";
}
