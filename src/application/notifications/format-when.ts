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
