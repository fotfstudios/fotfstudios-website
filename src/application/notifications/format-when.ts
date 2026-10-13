import { DateTime } from "luxon";

/**
 * El único formato de horario de los correos: "domingo 12 de julio, 14:00–16:00 h".
 *
 * - Zona del estudio (`tz`), locale es.
 * - El año solo cuando no es el año en curso (una reserva manual puede ser para
 *   dentro de meses; "lunes 5 de enero" sin año es ambiguo en diciembre).
 * - Con `endsAt`, rango de horas: lo que el cliente necesita para saber cuándo
 *   termina su sesión sin leer la línea "Sala · 2h".
 *
 * Antes este `toFormat` vivía copiado ocho veces en el servicio, más una variante
 * distinta (`fmtDateTime`, "lun 14 sep · 14:30") en el admin del curso: el mismo
 * correo salía con dos formatos según quién lo disparaba.
 */
export function formatSessionWhen(
  startsAt: string,
  tz: string,
  opts: { endsAt?: string | null; now?: DateTime } = {},
): string {
  const start = DateTime.fromISO(startsAt).setZone(tz).setLocale("es");
  const now = (opts.now ?? DateTime.now()).setZone(tz);
  const year = start.year === now.year ? "" : ` 'de' yyyy`;
  const day = start.toFormat(`cccc d 'de' LLLL${year}`);
  const hours = opts.endsAt
    ? `${start.toFormat("HH:mm")}–${DateTime.fromISO(opts.endsAt).setZone(tz).toFormat("HH:mm")}`
    : start.toFormat("HH:mm");
  return `${day}, ${hours} h`;
}

export interface SessionParts {
  /** "Viernes 16 de octubre" (+ " de 2027" si no es el año en curso). */
  date: string;
  /** "18:00–20:00" o, sin término, "18:00". */
  time: string;
  /** "2 h", "1 h 30 min", "45 min"; null sin término. */
  duration: string | null;
}

/**
 * El mismo horario que formatSessionWhen, partido para la ficha de los correos del flujo
 * de reserva (Fecha / Hora / duración en filas separadas). Misma zona y misma regla del año.
 */
export function formatSessionParts(
  startsAt: string,
  tz: string,
  opts: { endsAt?: string | null; now?: DateTime } = {},
): SessionParts {
  const start = DateTime.fromISO(startsAt).setZone(tz).setLocale("es");
  const now = (opts.now ?? DateTime.now()).setZone(tz);
  const year = start.year === now.year ? "" : ` 'de' yyyy`;
  const day = start.toFormat(`cccc d 'de' LLLL${year}`);
  const end = opts.endsAt ? DateTime.fromISO(opts.endsAt).setZone(tz) : null;
  let duration: string | null = null;
  if (end) {
    const mins = Math.round(end.diff(start, "minutes").minutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    duration = h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
  }
  return {
    date: day.charAt(0).toUpperCase() + day.slice(1),
    time: end ? `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}` : start.toFormat("HH:mm"),
    duration,
  };
}
