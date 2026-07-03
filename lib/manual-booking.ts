/**
 * Validación de la reserva manual del admin — puro, sin I/O. El admin es un
 * usuario de confianza: esto NO re-valida reglas de negocio (anticipación,
 * horario de apertura), solo rechaza input basura con mensajes en español.
 * Las reglas duras siguen en el servidor (checkout re-cotiza; exclusión en DB).
 */
import { DateTime } from "luxon";
import { err, ok, type Result } from "@/src/domain/shared/result";

export const MANUAL_METHODS = ["efectivo", "transferencia", "cortesia"] as const;
export type ManualPaymentMethod = (typeof MANUAL_METHODS)[number];

export interface ManualBookingFields {
  date: string; // "YYYY-MM-DD"
  startMinute: number; // 0..1439
  durationHours: number; // 1..16
  method: ManualPaymentMethod;
  addonKeys: string[];
  notes: string; // trimmed; "" = sin notas
}

const MAX_NOTES = 500;
const ADDON_KEY = /^[a-zA-Z0-9_-]{1,40}$/;

export function validateManualBooking(raw: {
  date: unknown;
  startMinute: unknown;
  durationHours: unknown;
  method: unknown;
  addonKeys: unknown;
  notes: unknown;
}): Result<ManualBookingFields, string> {
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid) {
    return err("Fecha inválida.");
  }

  const startMinute = raw.startMinute;
  if (typeof startMinute !== "number" || !Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    return err("Hora de inicio inválida.");
  }

  const durationHours = raw.durationHours;
  if (typeof durationHours !== "number" || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 16) {
    return err("Duración inválida: entre 1 y 16 horas.");
  }

  const method = raw.method;
  if (typeof method !== "string" || !(MANUAL_METHODS as readonly string[]).includes(method)) {
    return err("Método de pago inválido.");
  }

  const addonKeys = Array.isArray(raw.addonKeys) ? raw.addonKeys : null;
  if (!addonKeys || addonKeys.some((k) => typeof k !== "string" || !ADDON_KEY.test(k))) {
    return err("Add-on inválido.");
  }

  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notes.length > MAX_NOTES) return err(`Notas demasiado largas (máx. ${MAX_NOTES} caracteres).`);

  return ok({
    date,
    startMinute,
    durationHours,
    method: method as ManualPaymentMethod,
    addonKeys: addonKeys as string[],
    notes,
  });
}
