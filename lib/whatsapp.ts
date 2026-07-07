/**
 * WhatsApp estudio→cliente — puro, sin I/O. Normaliza teléfonos chilenos y arma
 * el mensaje de confirmación de una reserva manual (walk-in / teléfono / WA).
 * La dirección inversa (cliente→estudio) vive en `lib/pricing.ts bookingMessage`.
 */
import { DateTime } from "luxon";
import { SITE, SITE_URL } from "@/lib/site";
import { formatCLP } from "@/src/domain/money/money";
import type { ManualPaymentMethod } from "@/lib/manual-booking";

/**
 * Dígitos internacionales (sin `+`) de un teléfono chileno, o null si no se
 * reconoce: "+56 9 6280 3298" → "56962803298"; "962803298" → "56962803298".
 */
export function normalizePhoneCl(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  return null;
}

/** Link wa.me con mensaje prellenado, o null si el teléfono no se reconoce. */
export function waLink(phone: string, text: string): string | null {
  const digits = normalizePhoneCl(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export interface ManualBookingMessageInput {
  name?: string;
  date: string; // "YYYY-MM-DD" (fecha calendario local; sin tz)
  startMinute: number;
  durationHours: number;
  total: number | null; // null = cortesía (sin cobro)
  method: ManualPaymentMethod;
  addonNames: string[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const horas = (h: number) => (h === 1 ? "1 hora" : `${h} horas`);

/** Confirmación de reserva para enviar por WhatsApp (marcadores *negrita* / `mono`). */
export function manualBookingWhatsAppMessage(p: ManualBookingMessageInput): string {
  const bold = (s: string) => `*${s}*`;
  const dateLabel = DateTime.fromISO(p.date).setLocale("es").toFormat("cccc d 'de' MMMM");
  const end = p.startMinute + p.durationHours * 60;
  // "pendiente": el hold es firme pero el pago aún no se registra — nunca se le
  // dice al cliente que está "confirmada" ni "pagada" (sería falso).
  const isPendiente = p.method === "pendiente";

  const lines: string[] = [
    isPendiente
      ? `Hola${p.name ? ` ${p.name}` : ""}, tu reserva en ${bold(SITE.name)} quedó agendada, ${bold("pendiente de pago")}.`
      : `Hola${p.name ? ` ${p.name}` : ""}, tu reserva en ${bold(SITE.name)} está confirmada.`,
    "",
    `${bold("Día y hora:")} ${dateLabel}, ${hhmm(p.startMinute)}–${hhmm(end)} h`,
    `${bold("Duración:")} ${horas(p.durationHours)}`,
  ];
  if (p.addonNames.length > 0) lines.push(`${bold("Extras:")} ${p.addonNames.join(", ")}`);
  if (p.method === "cortesia" || p.total === null) {
    lines.push(`${bold("Cortesía:")} sesión sin cobro.`);
  } else if (isPendiente) {
    lines.push(`${bold("Total a pagar (IVA incl.):")} \`${formatCLP(p.total)}\` — pendiente de pago`);
  } else {
    const via = p.method === "transferencia" ? "por transferencia" : "en efectivo";
    lines.push(`${bold("Total (IVA incl.):")} \`${formatCLP(p.total)}\` — pagado ${via}`);
  }
  lines.push(
    `${bold("Dirección:")} ${SITE.address}`,
    "",
    `Al reservar aceptas nuestros términos y política de privacidad: ${SITE_URL}/terminos · ${SITE_URL}/privacidad`,
    "",
    "Llegas, conectas tu música y a darle. Nos vemos en cabina.",
  );
  return lines.join("\n");
}
