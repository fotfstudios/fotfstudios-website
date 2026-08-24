/**
 * Vocabulario visual compartido de los eventos del calendario. El color nunca
 * es el único canal: `eventAria` verbaliza lo que el tono codifica.
 */
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";

export type EventTone = "confirmed" | "held" | "block" | "curso";

type EventLike = Pick<AdminBooking, "kind" | "status" | "customerName" | "customerEmail" | "notes">;

export function toneOf(b: Pick<EventLike, "kind" | "status">): EventTone {
  if (b.kind === "curso") return "curso";
  if (b.kind === "block") return "block";
  return b.status === "held" ? "held" : "confirmed";
}

/** Bloques de la grilla (borde izquierdo = tono; tinte translúcido). Sin sirena: nada es urgente. */
export const TONE_CLS: Record<EventTone, string> = {
  confirmed: "border-gold bg-gold/10 hover:bg-gold/20",
  held: "border-dashed border-bone-dim bg-bone-dim/10 hover:bg-bone-dim/20",
  block: "border-bone-mute/40 bg-ink-soft/80 opacity-80 hover:opacity-100",
  // El curso ocupa la cabina y además es trabajo pagado: se lee más cerca de una
  // reserva que de un bloqueo, pero con borde punteado para no confundirse con
  // una reserva de cliente (no tiene ficha ni cliente al que abrirle).
  curso: "border-dashed border-gold/70 bg-gold/5 hover:bg-gold/15",
};

/** Puntos del mes en mobile. */
export const DOT_CLS: Record<EventTone, string> = {
  confirmed: "bg-gold",
  held: "bg-bone-dim",
  block: "bg-bone-mute",
  curso: "bg-gold/60",
};

const TONE_LABEL: Record<EventTone, string> = {
  confirmed: "Reserva confirmada",
  held: "Reserva en espera",
  block: "Bloqueo",
  curso: "Sesión de curso",
};

export function eventTitle(b: EventLike): string {
  if (b.kind === "curso") return b.notes ?? "Sesión de curso";
  if (b.kind === "block") return "Bloqueo";
  return b.customerName ?? b.customerEmail ?? "Reserva";
}

/** `dayLabel` desambigua en grillas multi-día (semana/mes): la columna es solo visual. */
export function eventAria(b: EventLike, timeLabel: string, dayLabel?: string): string {
  return `${TONE_LABEL[toneOf(b)]}, ${dayLabel ? `${dayLabel}, ` : ""}${timeLabel}, ${eventTitle(b)}`;
}
