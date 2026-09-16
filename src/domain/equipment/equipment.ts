/**
 * Inventario de equipos — catálogos del dominio. Espejo EXACTO de los CHECK de
 * `equipment_items` (migración 20260916120000_equipment); `equipment.itest.ts` verifica la
 * paridad contra la DB, igual que `PERMISSIONS` contra `admin_permissions`.
 */

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
