/**
 * Generador de archivos ICS (RFC 5545) y links de Google Calendar — puro y testeable.
 * Sin dependencias nuevas: Luxon (ya en el bundle) para pasar a UTC.
 *
 * Reglas de formato que importan (y que los tests fijan):
 * - Saltos de línea CRLF y plegado a ≤75 octetos (continuación = CRLF + espacio).
 * - Timestamps en UTC (`yyyyLLdd'T'HHmmss'Z'`).
 * - Escaping TEXT: `\` `;` `,` y saltos de línea (§3.3.11).
 * - `DTSTAMP` inyectable para output determinista (tests / reproducibilidad).
 */
import { DateTime } from "luxon";

export interface IcsEvent {
  /** ISO con offset (viene de `reservations.starts_at`). */
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
  /** Determinista, p. ej. `fotf-${orderId}@fotfstudios.cl`. */
  uid: string;
  url?: string;
}

/** ISO con offset → `20260709T220000Z`. */
function toUtcStamp(iso: string): string {
  return DateTime.fromISO(iso).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

/** Escaping de valores TEXT según RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Octetos UTF-8 de un string (TextEncoder: disponible en Node y navegador). */
const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

/** Plegado de línea a ≤75 octetos UTF-8; continuación = CRLF + espacio. */
function foldLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (utf8Length(current) + utf8Length(ch) > 75) {
      out.push(current);
      current = " ";
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function buildIcs(event: IcsEvent, opts: { dtstamp?: Date } = {}): string {
  const dtstamp = DateTime.fromJSDate(opts.dtstamp ?? new Date())
    .toUTC()
    .toFormat("yyyyLLdd'T'HHmmss'Z'");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FOTF Studios//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toUtcStamp(event.start)}`,
    `DTEND:${toUtcStamp(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}

/** Link "agregar a Google Calendar" prellenado (sin cuenta MP ni backend). */
export function googleCalendarUrl(
  event: Pick<IcsEvent, "start" | "end" | "summary" | "description" | "location">,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.summary,
    dates: `${toUtcStamp(event.start)}/${toUtcStamp(event.end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
