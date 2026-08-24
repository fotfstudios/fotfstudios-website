/**
 * Validación de la reserva manual del admin — puro, sin I/O. El admin es un
 * usuario de confianza: esto NO re-valida reglas de negocio (anticipación,
 * horario de apertura), solo rechaza input basura con mensajes en español.
 * Las reglas duras siguen en el servidor (checkout re-cotiza; exclusión en DB).
 */
import { DateTime } from "luxon";
import type { ManualDiscountInput } from "@/src/domain/pricing/manual-discount";
import { err, ok, type Result } from "@/src/domain/shared/result";

export const MANUAL_METHODS = ["pendiente", "efectivo", "transferencia", "cortesia"] as const;
export type ManualPaymentMethod = (typeof MANUAL_METHODS)[number];

export interface ManualBookingFields {
  date: string; // "YYYY-MM-DD"
  startMinute: number; // 0..1439
  durationHours: number; // 1..16
  method: ManualPaymentMethod;
  addonKeys: string[];
  notes: string; // trimmed; "" = sin notas
  /** Descuento digitado por el staff; undefined = sin descuento. */
  discount?: ManualDiscountInput;
}

const MAX_NOTES = 500;
const ADDON_KEY = /^[a-zA-Z0-9_-]{1,40}$/;
const MAX_REASON = 60;
/** Tope de cordura del monto; el límite real (< total) lo pone el motor con el quote del server. */
const MAX_DISCOUNT_CLP = 10_000_000;

/**
 * Valida la INTENCIÓN del descuento (objetivo, modo, valor, motivo). Nunca pesos
 * ya calculados: la base la resuelve el servidor contra su propio quote, así un
 * cliente manipulado no puede inventarse un total.
 */
function validateDiscount(raw: unknown): Result<ManualDiscountInput, string> {
  if (typeof raw !== "object" || raw === null) return err("Descuento inválido.");
  const d = raw as Record<string, unknown>;

  const rawTarget = d.target;
  if (typeof rawTarget !== "object" || rawTarget === null) return err("Objetivo del descuento inválido.");
  const { kind, key } = rawTarget as Record<string, unknown>;
  let target: ManualDiscountInput["target"];
  if (kind === "room" || kind === "total") {
    target = { kind };
  } else if (kind === "addon") {
    if (typeof key !== "string" || !ADDON_KEY.test(key)) return err("Add-on inválido.");
    target = { kind: "addon", key };
  } else {
    return err("Objetivo del descuento inválido.");
  }

  const mode = d.mode;
  if (mode !== "pct" && mode !== "amount") return err("Modo de descuento inválido.");

  const value = d.value;
  if (typeof value !== "number" || !Number.isInteger(value)) return err("Valor del descuento inválido.");
  if (mode === "pct" && (value < 1 || value > 100)) {
    return err("Porcentaje de descuento inválido: entre 1 y 100.");
  }
  if (mode === "amount" && (value < 1 || value > MAX_DISCOUNT_CLP)) {
    return err("Monto de descuento inválido.");
  }

  const reason = typeof d.reason === "string" ? d.reason.trim() : "";
  if (reason.length > MAX_REASON) {
    return err(`Motivo del descuento demasiado largo (máx. ${MAX_REASON} caracteres).`);
  }

  return ok({ target, mode, value, reason });
}

export function validateManualBooking(raw: {
  date: unknown;
  startMinute: unknown;
  durationHours: unknown;
  method: unknown;
  addonKeys: unknown;
  notes: unknown;
  discount?: unknown;
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

  // Una cortesía no crea pedido ni líneas: no hay nada sobre lo cual descontar.
  let discount: ManualDiscountInput | undefined;
  if (raw.discount != null) {
    if (method === "cortesia") return err("Una cortesía ya es sin cobro: no admite descuento.");
    const d = validateDiscount(raw.discount);
    if (!d.ok) return err(d.error);
    discount = d.value;
  }

  return ok({
    date,
    startMinute,
    durationHours,
    method: method as ManualPaymentMethod,
    addonKeys: addonKeys as string[],
    notes,
    discount,
  });
}
