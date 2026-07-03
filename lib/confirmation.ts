/**
 * View-model de la página de confirmación — puro y testeable.
 * Convierte el modelo de lectura (`OrderConfirmation`) en strings listos para la UI,
 * con los MISMOS formatos que el email de confirmación (notification-service.ts):
 * `when` = `cccc d 'de' LLLL, HH:mm 'h'` en es / America/Santiago, montos vía formatCLP.
 */
import { DateTime } from "luxon";
import { formatCLP } from "@/src/domain/money/money";
import type { OrderConfirmation } from "@/src/application/ports/orders";

const TZ = "America/Santiago";

export interface ConfirmationView {
  firstName: string | null;
  /** "jueves 9 de julio, 18:00 h" — idéntico al email. */
  when: string | null;
  /** "18:00–20:00" */
  timeRange: string | null;
  /** "2 h" / "1,5 h" (coma es-CL). */
  durationLabel: string | null;
  resourceName: string | null;
  lines: { description: string; amount: string }[];
  total: string;
  /** ISO passthrough para .ics / Google Calendar. */
  startsAt: string | null;
  endsAt: string | null;
}

/** Primer nombre (mismo split que payment-service). Vacío/espacios → null. */
export function firstNameOf(name: string | null | undefined): string | null {
  const [first] = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return first ?? null;
}

/** Duración legible entre dos ISO: entera "2 h", fraccional "1,5 h". */
export function durationLabel(startsAt: string, endsAt: string): string {
  const hours = DateTime.fromISO(endsAt).diff(DateTime.fromISO(startsAt), "hours").hours;
  return `${hours.toLocaleString("es-CL")} h`;
}

/** ¿La sesión aún no termina? (reloj inyectable para tests y pureza en render). */
export function isUpcoming(endsAt: string | null, now: Date = new Date()): boolean {
  return !!endsAt && new Date(endsAt).getTime() > now.getTime();
}

export function buildConfirmationView(m: OrderConfirmation, tz: string = TZ): ConfirmationView {
  const start = m.startsAt ? DateTime.fromISO(m.startsAt).setZone(tz).setLocale("es") : null;
  const end = m.endsAt ? DateTime.fromISO(m.endsAt).setZone(tz).setLocale("es") : null;

  return {
    firstName: firstNameOf(m.customerName),
    when: start ? start.toFormat("cccc d 'de' LLLL, HH:mm 'h'") : null,
    timeRange: start && end ? `${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}` : null,
    durationLabel: m.startsAt && m.endsAt ? durationLabel(m.startsAt, m.endsAt) : null,
    resourceName: m.resourceName,
    lines: m.lines.map((l) => ({ description: l.description, amount: formatCLP(l.subtotal) })),
    total: formatCLP(m.total),
    startsAt: m.startsAt,
    endsAt: m.endsAt,
  };
}
