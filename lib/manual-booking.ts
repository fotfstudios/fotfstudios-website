/**
 * Validación de la reserva manual del admin — puro, sin I/O. El admin es un
 * usuario de confianza: esto NO re-valida reglas de negocio (anticipación,
 * horario de apertura), solo rechaza input basura con mensajes en español.
 * Las reglas duras siguen en el servidor (checkout re-cotiza; exclusión en DB).
 */
import { DateTime } from "luxon";
import type { ManualDiscountInput } from "@/src/domain/pricing/manual-discount";
import { err, ok, type Result } from "@/src/domain/shared/result";
import { isOfflineMethod, type OfflineMethod } from "@/src/domain/money/payment-method";

/**
 * Tres ejes que antes se mezclaban en una sola lista de "método de pago"
 * (pendiente / efectivo / transferencia / cortesía):
 *   · TIPO de reserva — qué se cobra: ensayo (tarifa de sala) o cortesía (sin cobro).
 *   · ¿YA PAGÓ? — si no, nace pendiente y se liquida después.
 *   · MÉTODO — solo si ya pagó: transferencia o efectivo. Si los puntos cubren el
 *     100 %, el método es "puntos" y lo decide el servidor (no se elige).
 */
export const MANUAL_TYPES = ["ensayo", "cortesia", "prueba"] as const;
export type ManualBookingType = (typeof MANUAL_TYPES)[number];

/**
 * Paso de la duración según el tipo. Una cortesía no se cobra, así que admite
 * medias horas (una sesión del curso dura 1,5 h); lo que cobra va en horas
 * enteras porque el motor de precios no cotiza fracciones.
 */
export const durationStepFor = (type: ManualBookingType): 0.5 | 1 => (type === "cortesia" ? 0.5 : 1);

export interface ManualBookingFields {
  date: string; // "YYYY-MM-DD"
  startMinute: number; // 0..1439
  durationHours: number; // 1..16; la cortesía admite medias horas
  type: ManualBookingType;
  /** ¿Ya pagó? false = nace pendiente (se liquida después). Una cortesía siempre false. */
  paid: boolean;
  /** Solo con `paid`: cómo pagó. null = lo cubren los puntos (lo verifica el servidor). */
  method: OfflineMethod | null;
  addonKeys: string[];
  notes: string; // trimmed; "" = sin notas
  /**
   * Ficha elegida en el picker. El cliente NUNCA manda nombre/email/teléfono:
   * el servidor los lee de `customers` con este id, así un navegador
   * manipulado no puede inventar el snapshot de una reserva.
   */
  customerId: string | null;
  /**
   * Walk-in solo-nombre (decisión del dueño: siguen siendo legales). Se usa
   * únicamente cuando `customerId` es null; no crea ficha.
   */
  walkInName: string;
  /** Puntos a descontar (0 = ninguno). Solo puede ser > 0 con `customerId`. */
  pointsToRedeem: number;
  /** Descuento digitado por el staff; undefined = sin descuento. */
  discount?: ManualDiscountInput;
}

const MAX_NOTES = 500;
const MAX_WALKIN_NAME = 80;
/** uuid v4 tal como los genera `gen_random_uuid()`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDON_KEY = /^[a-zA-Z0-9_-]{1,40}$/;
const MAX_REASON = 60;
/** Tope de cordura del monto; el límite real (< total) lo pone el motor con el quote del server. */
const MAX_DISCOUNT_CLP = 10_000_000;
/** Tope de cordura del canje; el límite real lo pone el saldo del cliente, en la DB. */
const MAX_POINTS = 10_000_000;

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
  type: unknown;
  paid: unknown;
  method?: unknown;
  addonKeys: unknown;
  notes: unknown;
  customerId?: unknown;
  walkInName?: unknown;
  pointsToRedeem?: unknown;
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

  // El tipo va antes que la duración porque el paso depende de él.
  const rawType = raw.type;
  if (typeof rawType !== "string" || !(MANUAL_TYPES as readonly string[]).includes(rawType)) {
    return err("Tipo de reserva inválido.");
  }
  const type = rawType as ManualBookingType;

  const step = durationStepFor(type);
  const durationHours = raw.durationHours;
  if (
    typeof durationHours !== "number" ||
    !Number.isInteger(durationHours / step) ||
    durationHours < 1 ||
    durationHours > 16
  ) {
    return err(
      step === 1 ? "Duración inválida: entre 1 y 16 horas." : "Duración inválida: entre 1 y 16 horas, en medias horas.",
    );
  }

  const addonKeys = Array.isArray(raw.addonKeys) ? raw.addonKeys : null;
  if (!addonKeys || addonKeys.some((k) => typeof k !== "string" || !ADDON_KEY.test(k))) {
    return err("Add-on inválido.");
  }

  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notes.length > MAX_NOTES) return err(`Notas demasiado largas (máx. ${MAX_NOTES} caracteres).`);

  // Cliente: o una ficha del directorio, o un walk-in solo-nombre. Nunca ambos
  // y nunca los datos de contacto sueltos — esos salen de la ficha, en el server.
  const customerId = raw.customerId == null || raw.customerId === "" ? null : raw.customerId;
  if (customerId !== null && (typeof customerId !== "string" || !UUID.test(customerId))) {
    return err("Cliente inválido.");
  }
  const walkInName = typeof raw.walkInName === "string" ? raw.walkInName.trim() : "";
  if (walkInName.length > MAX_WALKIN_NAME) {
    return err("El nombre no puede superar los 80 caracteres.");
  }
  // Sin ficha Y sin nombre queda una reserva de nadie: las cuatro columnas de
  // contacto en NULL, sin forma de saber de quién es la sesión ni a quién
  // avisarle. Con cobro es peor todavía (pedido pagado y anónimo). El walk-in
  // solo-nombre sigue siendo legal — eso es tener nombre, no tener ficha.
  if (customerId === null && !walkInName) {
    return err("Elige un cliente o escribe un nombre.");
  }

  // Canje: la ficha es obligatoria porque el saldo cuelga de ella, y el monto
  // final lo resuelve la DB con row lock (acá solo se valida la INTENCIÓN, igual
  // que con el descuento). El tope duro lo pone el saldo; este es de cordura.
  const rawPoints = raw.pointsToRedeem;
  let pointsToRedeem = 0;
  if (rawPoints != null && rawPoints !== "") {
    if (typeof rawPoints !== "number" || !Number.isInteger(rawPoints) || rawPoints < 0) {
      return err("Puntos inválidos.");
    }
    if (rawPoints > MAX_POINTS) return err("Puntos inválidos.");
    pointsToRedeem = rawPoints;
  }
  if (pointsToRedeem > 0 && customerId === null) {
    return err("Para canjear puntos, elige un cliente con ficha.");
  }
  if (pointsToRedeem > 0 && type === "cortesia") {
    return err("Una cortesía ya es sin cobro: no admite canje de puntos.");
  }

  // Una cortesía no crea pedido ni líneas: no hay nada sobre lo cual descontar.
  let discount: ManualDiscountInput | undefined;
  if (raw.discount != null) {
    if (type === "cortesia") return err("Una cortesía ya es sin cobro: no admite descuento.");
    const d = validateDiscount(raw.discount);
    if (!d.ok) return err(d.error);
    discount = d.value;
  }

  // Prueba del Curso de DJ: 1 h guiada a precio fijo. El crédito que deja va al email
  // de la ficha, así que la ficha es obligatoria (sin walk-in).
  if (type === "prueba") {
    if (durationHours !== 1) return err("La prueba dura 1 hora.");
    if (addonKeys.length > 0) return err("La prueba no lleva extras.");
    if (pointsToRedeem > 0 || discount) return err("La prueba tiene precio fijo: sin descuento ni puntos.");
    if (customerId === null) return err("Para una prueba elige un cliente con ficha (el crédito va a su email).");
  }

  // Pago: al final, porque "pagó con puntos" depende del canje de arriba.
  if (typeof raw.paid !== "boolean") return err("Indica si ya pagó.");
  const paid = raw.paid;
  const rawMethod = raw.method == null || raw.method === "" ? null : raw.method;
  if (rawMethod !== null && !isOfflineMethod(rawMethod)) return err("Método de pago inválido.");
  const method = rawMethod;
  if (type === "cortesia" && (paid || method)) return err("Una cortesía ya es sin cobro: no admite pago.");
  if (!paid && method) return err("Una reserva pendiente no lleva método de pago.");
  // Sin método solo si hay canje: si los puntos no cubren el total lo rechaza el servidor.
  if (paid && !method && pointsToRedeem === 0) return err("Elige el método de pago.");

  return ok({
    date,
    startMinute,
    durationHours,
    type,
    paid,
    method,
    addonKeys: addonKeys as string[],
    notes,
    customerId,
    walkInName,
    pointsToRedeem,
    discount,
  });
}
