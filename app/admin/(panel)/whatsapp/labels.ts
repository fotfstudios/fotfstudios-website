import type { WaEvent } from "@/src/application/whatsapp/templates";

export const WA_EVENT_LABEL: Record<WaEvent, string> & Record<string, string | undefined> = {
  booking_confirmed: "Reserva confirmada",
  session_reminder: "Recordatorio de sesión",
  access_pin: "Código de acceso",
  payment_pending: "Pago pendiente",
  payment_reminder: "Recordatorio de pago",
  trial_rescheduled: "Prueba del curso movida",
  practice_moved: "Práctica movida",
  owner_new_booking: "Dueño · nueva reserva",
  owner_payment_pending: "Dueño · pago pendiente",
  owner_cancellation: "Dueño · cancelación",
  owner_new_lead: "Dueño · nuevo lead",
  owner_trial_rescheduled: "Dueño · prueba movida",
  owner_practice_moved: "Dueño · práctica movida",
  test_ping: "Prueba",
};

/** `56912345678` → `+56 9 •••• 5678`: el admin ve a quién, sin exponer el número completo. */
export function maskPhone(digits: string | null): string {
  if (!digits) return "—";
  if (/^569\d{8}$/.test(digits)) return `+56 9 •••• ${digits.slice(-4)}`;
  return `+${digits.slice(0, 2)} •••• ${digits.slice(-4)}`;
}
