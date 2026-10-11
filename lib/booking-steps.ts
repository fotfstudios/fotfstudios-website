/**
 * Qué le falta a la reserva para poder pagar, en el orden en que se pide en /reservar
 * (horario, email, nombre, celular, términos).
 * Puro: decide el paso del wizard móvil, a dónde hace scroll el CTA y su etiqueta
 * ("Ir a pagar $24.000" o, tras un intento, lo que falta).
 */
import { normalizeEmail } from "@/src/domain/contact/contact";
import { formatCLP } from "@/src/domain/money/money";
import { isValidClMobile } from "./phone-input";

export type BookingStep = "horario" | "datos" | "pago";

export interface BookingStepState {
  hasSlot: boolean;
  name: string;
  email: string;
  phone: string;
  termsAccepted: boolean;
}

export interface MissingItem {
  step: BookingStep;
  /** id del elemento al que lleva el CTA (scroll + foco). */
  anchorId: string;
  label: string;
}

const dataOk = (s: BookingStepState) => !!s.name.trim() && normalizeEmail(s.email) !== null && isValidClMobile(s.phone);

export function missingItem(s: BookingStepState): MissingItem | null {
  if (!s.hasSlot) return { step: "horario", anchorId: "bk-schedule", label: "Selecciona un horario" };
  // Mismo orden que los campos en pantalla: email, nombre, celular.
  if (normalizeEmail(s.email) === null) return { step: "datos", anchorId: "bk-email", label: "Ingresa tu email" };
  if (!s.name.trim()) return { step: "datos", anchorId: "bk-name", label: "Ingresa tu nombre" };
  if (!isValidClMobile(s.phone)) return { step: "datos", anchorId: "bk-phone", label: "Ingresa tu celular" };
  if (!s.termsAccepted) return { step: "pago", anchorId: "bk-terms", label: "Acepta los términos" };
  return null;
}

/** Pasos completos contando desde el primero (0–3): horario, datos, pago. */
export function stepsCompleted(s: BookingStepState): number {
  if (!s.hasSlot) return 0;
  if (!dataOk(s)) return 1;
  return s.termsAccepted ? 3 : 2;
}

export function ctaLabel(o: {
  state: BookingStepState;
  tried: boolean;
  submitting: boolean;
  fullPoints: boolean;
  payable: number | null;
}): string {
  if (o.submitting) return o.fullPoints ? "Confirmando…" : "Redirigiendo…";
  const missing = missingItem(o.state);
  if (o.tried && missing) return missing.label;
  if (o.fullPoints) return "Pagar con Beatcoins";
  return o.state.hasSlot && o.payable !== null ? `Ir a pagar ${formatCLP(o.payable)}` : "Ir a pagar";
}
