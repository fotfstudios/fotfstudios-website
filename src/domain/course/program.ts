/**
 * El programa 1:1 del Curso de Iniciación DJ — forma y grilla, puro y sin IO.
 *
 * Fuente única de los números del producto (spec 2026-09-25 §1): `lib/curso-content`
 * los deriva de acá para el copy y el JSON-LD, y el admin los usa para agendar.
 * Desde 1:1 cada pedido es su propio programa (una fila de course_generations).
 */
import { type CourseSessionPlan, planSessions } from "./sessions";

export const COURSE_PROGRAM = {
  sessions: 6,
  sessionMinutes: 90,
  classHours: 9,
  practiceHours: 6,
  /** Las 6 sesiones se dictan dentro de estas semanas desde la primera (términos §6). */
  windowWeeks: 10,
} as const;

export interface ProgramLayoutInput {
  /** Fecha local de la sesión 1 (YYYY-MM-DD). */
  firstDate: string;
  /** Minuto del día en que empieza cada sesión (hora local). */
  startMinute: number;
  /** Un título por sesión, en orden; tienen que ser exactamente las del programa. */
  titles: readonly string[];
  /** Semanas entre sesiones (1 = semanal, el default del curso). */
  everyWeeks?: number;
  tz: string;
}

/**
 * Las 6 sesiones de 90 min a la misma hora de pared (ver `planSessions` para el
 * cambio de horario). Falla antes de tocar la DB si la grilla no es la del producto.
 */
export function planProgramSessions(input: ProgramLayoutInput): CourseSessionPlan[] {
  if (input.titles.length !== COURSE_PROGRAM.sessions) throw new Error("curso_titulos_invalidos");
  const everyWeeks = input.everyWeeks ?? 1;
  if ((COURSE_PROGRAM.sessions - 1) * everyWeeks > COURSE_PROGRAM.windowWeeks) {
    throw new Error("curso_fuera_de_ventana");
  }
  return planSessions({
    firstDate: input.firstDate,
    startMinute: input.startMinute,
    durationHours: COURSE_PROGRAM.sessionMinutes / 60,
    titles: input.titles,
    everyWeeks,
    tz: input.tz,
  });
}
