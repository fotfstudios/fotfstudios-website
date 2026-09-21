/**
 * Inventario de equipos — catálogos del dominio. Espejo EXACTO de los CHECK de
 * `equipment_items` (migración 20260916120000_equipment); `equipment.itest.ts` verifica la
 * paridad contra la DB, igual que `PERMISSIONS` contra `admin_permissions`.
 */
import { err, ok, type Result } from "@/src/domain/shared/result";

export const EQUIPMENT_CATEGORIES = {
  reproductor: "Reproductor",
  mixer: "Mixer",
  monitor: "Monitor",
  audifonos: "Audífonos",
  cable: "Cable",
  computador: "Computador",
  mobiliario: "Mobiliario",
  otro: "Otro",
} as const;
export type EquipmentCategory = keyof typeof EQUIPMENT_CATEGORIES;
export const EQUIPMENT_CATEGORY_KEYS = Object.keys(EQUIPMENT_CATEGORIES) as EquipmentCategory[];

export const EQUIPMENT_STATUSES = {
  in_service: "En uso",
  storage: "Guardado",
  repair: "En reparación",
  loaned: "Prestado",
  retired: "Dado de baja",
} as const;
export type EquipmentStatus = keyof typeof EQUIPMENT_STATUSES;
export const EQUIPMENT_STATUS_KEYS = Object.keys(EQUIPMENT_STATUSES) as EquipmentStatus[];

/** Topes de las columnas de `equipment_items` / `equipment_moves`. */
export const EQUIPMENT_CAPS = { brand: 60, model: 80, nickname: 40, serial: 80, spot: 60, vendor: 80, notes: 2000, note: 500 } as const;

export interface EquipmentInput {
  category: EquipmentCategory;
  brand: string;
  model: string;
  nickname: string | null;
  serialNumber: string | null;
  quantity: number;
  status: EquipmentStatus;
  locationId: string;
  resourceId: string | null;
  spot: string | null;
  /** AAAA-MM-DD */
  purchasedAt: string | null;
  purchasePriceClp: number | null;
  vendor: string | null;
  /** AAAA-MM-DD */
  warrantyUntil: string | null;
  notes: string | null;
}

/** Lo editable desde la ficha: sin posición ni estado (eso es un movimiento). */
export type EquipmentDetailsInput = Omit<EquipmentInput, "status" | "locationId" | "resourceId" | "spot">;

export interface MoveInput {
  quantity: number;
  status: EquipmentStatus;
  locationId: string;
  resourceId: string | null;
  spot: string | null;
  note: string | null;
}

/** Sedes activas con sus salas activas (para los selects de posición). */
export interface PositionCatalog {
  locations: { id: string; name: string; resources: { id: string; name: string }[] }[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const asObj = (raw: unknown): Raw => (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Raw;
/** String recortado con espacios internos colapsados; no-string → "". */
const str = (o: Raw, k: string): string => (typeof o[k] === "string" ? (o[k] as string).trim().replace(/\s+/g, " ") : "");
const opt = (s: string): string | null => (s === "" ? null : s);

/** Entero desde string/number; null si no es entero (acepta "" como null solo si `allowEmpty`). */
function int(o: Raw, k: string): number | null | undefined {
  const v = o[k];
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (s === "") return undefined;
  return /^-?\d+$/.test(s) ? Number.parseInt(s, 10) : null;
}

/** AAAA-MM-DD real (rechaza 2024-02-30). */
function isoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseDetails(o: Raw): Result<EquipmentDetailsInput> {
  const category = str(o, "category") as EquipmentCategory;
  if (!EQUIPMENT_CATEGORY_KEYS.includes(category)) return err("Categoría no válida.");

  const brand = str(o, "brand");
  if (!brand) return err("La marca es obligatoria.");
  if (brand.length > EQUIPMENT_CAPS.brand) return err(`La marca no puede superar los ${EQUIPMENT_CAPS.brand} caracteres.`);
  const model = str(o, "model");
  if (!model) return err("El modelo es obligatorio.");
  if (model.length > EQUIPMENT_CAPS.model) return err(`El modelo no puede superar los ${EQUIPMENT_CAPS.model} caracteres.`);

  const nickname = opt(str(o, "nickname"));
  if (nickname && nickname.length > EQUIPMENT_CAPS.nickname) return err(`El apodo no puede superar los ${EQUIPMENT_CAPS.nickname} caracteres.`);
  const serialNumber = opt(str(o, "serialNumber"));
  if (serialNumber && serialNumber.length > EQUIPMENT_CAPS.serial) return err(`La serie no puede superar los ${EQUIPMENT_CAPS.serial} caracteres.`);

  const quantity = int(o, "quantity");
  if (quantity === undefined || quantity === null || quantity < 1) return err("La cantidad debe ser un entero mayor o igual a 1.");
  if (serialNumber && quantity !== 1) return err("Un equipo con número de serie es una sola unidad (cantidad 1).");

  const purchasedAt = opt(str(o, "purchasedAt"));
  if (purchasedAt && !isoDate(purchasedAt)) return err("Fecha de compra no válida (AAAA-MM-DD).");
  const price = int(o, "purchasePriceClp");
  if (price === null || (price !== undefined && price < 0)) return err("El precio debe ser un entero en pesos, sin decimales.");
  const vendor = opt(str(o, "vendor"));
  if (vendor && vendor.length > EQUIPMENT_CAPS.vendor) return err(`El proveedor no puede superar los ${EQUIPMENT_CAPS.vendor} caracteres.`);
  const warrantyUntil = opt(str(o, "warrantyUntil"));
  if (warrantyUntil && !isoDate(warrantyUntil)) return err("Fecha de garantía no válida (AAAA-MM-DD).");
  // Solo trim, sin colapsar espacios internos (a diferencia de str()): es un textarea, así
  // que los saltos de línea se conservan tal cual los escribió quien carga el equipo.
  const notes = opt(typeof o.notes === "string" ? o.notes.trim() : "");
  if (notes && notes.length > EQUIPMENT_CAPS.notes) return err(`Las notas no pueden superar los ${EQUIPMENT_CAPS.notes} caracteres.`);

  return ok({ category, brand, model, nickname, serialNumber, quantity, purchasedAt, purchasePriceClp: price ?? null, vendor, warrantyUntil, notes });
}

function parsePosition(o: Raw): Result<{ locationId: string; resourceId: string | null; spot: string | null }> {
  const locationId = str(o, "locationId");
  if (!UUID_RE.test(locationId)) return err("Elige una ubicación.");
  const resourceId = opt(str(o, "resourceId"));
  if (resourceId && !UUID_RE.test(resourceId)) return err("Sala no válida.");
  const spot = opt(str(o, "spot"));
  if (spot && spot.length > EQUIPMENT_CAPS.spot) return err(`El lugar no puede superar los ${EQUIPMENT_CAPS.spot} caracteres.`);
  return ok({ locationId, resourceId, spot });
}

function parseStatus(o: Raw): Result<EquipmentStatus> {
  const status = str(o, "status") as EquipmentStatus;
  return EQUIPMENT_STATUS_KEYS.includes(status) ? ok(status) : err("Estado no válido.");
}

/** Alta completa (detalles + posición + estado). Devuelve Result — el dominio no lanza. */
export function parseEquipmentInput(raw: unknown): Result<EquipmentInput> {
  const o = asObj(raw);
  const details = parseDetails(o);
  if (!details.ok) return details;
  const status = parseStatus(o);
  if (!status.ok) return status;
  const pos = parsePosition(o);
  if (!pos.ok) return pos;
  return ok({ ...details.value, status: status.value, ...pos.value });
}

/** Edición de la ficha. La cantidad viaja acá; el repositorio decide si puede cambiar. */
export function parseEquipmentDetails(raw: unknown): Result<EquipmentDetailsInput> {
  return parseDetails(asObj(raw));
}

/** Movimiento: 1..cantidad actual, destino y estado obligatorios, nota opcional. */
export function parseMoveInput(raw: unknown, current: { quantity: number }): Result<MoveInput> {
  const o = asObj(raw);
  const quantity = int(o, "quantity");
  if (quantity === undefined || quantity === null || quantity < 1 || quantity > current.quantity) {
    return err(`Cantidad fuera de rango (1 a ${current.quantity}).`);
  }
  const status = parseStatus(o);
  if (!status.ok) return status;
  const pos = parsePosition(o);
  if (!pos.ok) return pos;
  // Mismo motivo que `notes` en parseDetails: solo trim, los saltos de línea del textarea
  // se conservan.
  const note = opt(typeof o.note === "string" ? o.note.trim() : "");
  if (note && note.length > EQUIPMENT_CAPS.note) return err(`La nota no puede superar los ${EQUIPMENT_CAPS.note} caracteres.`);
  return ok({ quantity, status: status.value, ...pos.value, note });
}

/** Valor del <select> de posición: "sede:sala" (sala vacía = solo sede). */
export function positionValue(locationId: string, resourceId: string | null): string {
  return `${locationId}:${resourceId ?? ""}`;
}

export function parsePositionValue(v: string): { locationId: string; resourceId: string | null } | null {
  const i = v.indexOf(":");
  if (i < 0) return null;
  const locationId = v.slice(0, i);
  const resourceId = v.slice(i + 1);
  if (!UUID_RE.test(locationId)) return null;
  if (resourceId && !UUID_RE.test(resourceId)) return null;
  return { locationId, resourceId: resourceId || null };
}

/** Opciones del select: la sede sola y luego cada sala. */
export function positionOptions(catalog: PositionCatalog): { value: string; label: string }[] {
  return catalog.locations.flatMap((l) => [
    { value: positionValue(l.id, null), label: `${l.name} (sin sala)` },
    ...l.resources.map((r) => ({ value: positionValue(l.id, r.id), label: r.name })),
  ]);
}

/** "Sala de ensayo DJ · cabina" — la sala manda; sin sala, la sede. */
export function positionLabel(p: { locationName: string; resourceName: string | null; spot: string | null }): string {
  return [p.resourceName ?? p.locationName, p.spot].filter(Boolean).join(" · ");
}

export const EQUIPMENT_GENERIC_DB_ERROR = "No se pudo guardar el equipo. Intenta de nuevo.";

/** Traduce claves de las RPC (`equipment_*`) y códigos SQLSTATE a frases; nunca deja pasar Postgres crudo. */
export function equipmentErrorMessage(code: string | null | undefined, message: string): string {
  if (message.includes("equipment_no_change")) return "El equipo ya está ahí.";
  if (message.includes("equipment_bad_quantity")) return "Cantidad fuera de rango.";
  if (message.includes("equipment_not_found")) return "Ese equipo ya no existe.";
  if (code === "23505") return "Ya existe un equipo con esa serie.";
  if (code === "23503") return "La sala no pertenece a esa sede.";
  return EQUIPMENT_GENERIC_DB_ERROR;
}
