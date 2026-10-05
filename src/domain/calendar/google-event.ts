/**
 * Reserva → evento de Google Calendar (espejo de la agenda; spec 2026-10-01). Puro: sin red
 * ni base, como `ics.ts`. Lo usa el worker de `calendar_sync` para decidir QUÉ mandar; el
 * adaptador de Google decide CÓMO.
 *
 * Reglas que los tests fijan:
 * - El id del evento se deriva de la reserva, así un bloqueo borrado se puede borrar en
 *   Google sin guardar ningún mapeo.
 * - El contacto del cliente nunca sale: el tipo ni siquiera lo trae, y las notas de una
 *   reserva de cliente (texto libre del admin) tampoco.
 * - Lo pasado no se borra: la agenda vieja queda como historial.
 */
import { DateTime } from "luxon";

export type ReservationKind = "booking" | "block" | "curso" | "prueba";
export type ReservationStatus = "held" | "confirmed" | "cancelled" | "expired";

/** Foto de una reserva (RPC `calendar_sync_snapshot`). Sin email ni teléfono, a propósito. */
export interface ReservationSnapshot {
  id: string;
  kind: ReservationKind;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  expiresAt: string | null;
  customerName: string | null;
  notes: string | null;
  orderId: string | null;
  rescheduleId: string | null;
  course: { n: number; title: string; sessionStatus: string; generationName: string } | null;
  addons: string[];
  tz: string;
}

/** El subconjunto del recurso Event de la API v3 que la app escribe. */
export interface GoogleEventPayload {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: "confirmed" | "tentative";
  colorId?: string;
  reminders: { useDefault: true } | { useDefault: false; overrides: [] };
  extendedProperties: { private: { reservationId: string; kind: ReservationKind; status: ReservationStatus } };
}

const UUID_HEX = /^[0-9a-f]{32}$/;

/**
 * "fotf" + el hex del uuid. Google exige base32hex (a-v, 0-9) de 5 a 1024 caracteres; el hex
 * cabe. Lanza ante algo que no sea un uuid: con un id inválido Google inventaría uno propio y
 * el vínculo reserva → evento se perdería en silencio.
 */
export function googleEventId(reservationId: string): string {
  const hex = reservationId.toLowerCase().replace(/-/g, "");
  if (!UUID_HEX.test(hex)) throw new Error(`reservation id inválido para Google Calendar: ${reservationId}`);
  return `fotf${hex}`;
}

/**
 * ¿El evento tiene que existir? No existe la reserva (DELETE físico), o está cancelada o
 * expirada → borrar. Un hold ya vencido también: el barrido de expiración corre cada minuto y
 * crear un tentativo que vive segundos es ruido en el teléfono del dueño.
 */
export function decideOutcome(s: ReservationSnapshot | null, now: Date): "upsert" | "delete" {
  if (!s) return "delete";
  if (s.status === "cancelled" || s.status === "expired") return "delete";
  if (s.status === "held" && s.expiresAt && new Date(s.expiresAt) <= now) return "delete";
  return "upsert";
}

const HOURS = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

/** "2h", "1,5h" — mismo formato que las líneas del pedido ("Sala · 2h"). */
function duration(startsAt: string, endsAt: string): string {
  const h = DateTime.fromISO(endsAt).diff(DateTime.fromISO(startsAt), "hours").hours;
  return `${HOURS.format(h)}h`;
}

/** Una línea, sin saltos ni espacios dobles: va en un título. */
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

function summary(s: ReservationSnapshot): string {
  switch (s.kind) {
    case "curso":
      if (s.course) return `Curso DJ · ${s.course.generationName} · Sesión ${s.course.n}: ${s.course.title}`;
      // schedule_course_generation siempre escribe "Curso G02 · Sesión 3" en notes.
      return s.notes ? oneLine(s.notes) : "Curso DJ";
    case "block":
      return s.notes?.trim() ? `Bloqueo · ${oneLine(s.notes)}` : "Bloqueo";
    case "prueba": {
      const base = `Prueba Curso DJ · ${s.customerName?.trim() || "Alumno"} · ${duration(s.startsAt, s.endsAt)}`;
      return s.status === "held" ? `${base} (pendiente de pago)` : base;
    }
    case "booking": {
      const base = `Sala · ${s.customerName?.trim() || "Reserva"} · ${duration(s.startsAt, s.endsAt)}`;
      if (s.status !== "held") return base;
      return s.rescheduleId ? `${base} (reagendamiento pendiente de pago)` : `${base} (pendiente de pago)`;
    }
  }
}

const KIND_LABEL: Record<ReservationKind, string> = {
  booking: "reserva",
  curso: "curso",
  block: "bloqueo",
  prueba: "prueba del curso",
};

function description(s: ReservationSnapshot, siteUrl: string): string {
  const lines = [`Ficha: ${siteUrl.replace(/\/$/, "")}/admin/reservas/${s.id}`];
  if (s.orderId) lines.push(`Pedido: ${s.orderId}`);
  if (s.addons.length) lines.push(`Extras: ${s.addons.join(", ")}`);
  // Las notas de una reserva de cliente son texto libre del admin (y los reagendamientos les
  // agregan líneas): pueden traer un teléfono. Solo salen las de bloqueos y cursos (una
  // prueba es de un cliente: sus notas quedan privadas como las de una reserva).
  if ((s.kind === "block" || s.kind === "curso") && s.notes?.trim()) lines.push(`Notas: ${s.notes.trim()}`);
  lines.push(`Tipo: ${KIND_LABEL[s.kind]}`);
  return lines.join("\n");
}

function colorId(s: ReservationSnapshot): string | undefined {
  if (s.kind === "curso") return "9"; // arándano
  if (s.kind === "block") return "8"; // grafito
  if (s.status === "held") return "5"; // banana: pendiente
  if (s.kind === "prueba") return "6"; // mandarina: prueba del curso
  return undefined; // reserva confirmada: el color del calendario
}

/** Instante almacenado (UTC) → hora local con offset + la zona del estudio. DST lo resuelve Luxon. */
function at(iso: string, tz: string): { dateTime: string; timeZone: string } {
  return { dateTime: DateTime.fromISO(iso).setZone(tz).toISO() ?? iso, timeZone: tz };
}

export function toGoogleEvent(s: ReservationSnapshot, opts: { siteUrl: string }): GoogleEventPayload {
  const quiet = s.status === "held" || s.kind === "block";
  const color = colorId(s);
  return {
    summary: summary(s),
    description: description(s, opts.siteUrl),
    start: at(s.startsAt, s.tz),
    end: at(s.endsAt, s.tz),
    status: s.status === "held" ? "tentative" : "confirmed",
    ...(color ? { colorId: color } : {}),
    // Un hold puede no concretarse y un bloqueo no es una cita: que no suenen.
    reminders: quiet ? { useDefault: false, overrides: [] } : { useDefault: true },
    extendedProperties: { private: { reservationId: s.id, kind: s.kind, status: s.status } },
  };
}

/** JSON con claves ordenadas a toda profundidad: base estable del fingerprint. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
