/**
 * Búsqueda, filtros y paginación de /admin/equipos (puro, sin IO). El estado vive en la
 * URL (?q=&cat=&estado=&p=). Espejo de `clientes-list.ts`. `estado=activos` (default) es
 * "todo menos dados de baja": lo retirado no estorba, pero sigue a un clic.
 */
import { EQUIPMENT_CATEGORY_KEYS, EQUIPMENT_STATUS_KEYS, type EquipmentCategory, type EquipmentStatus } from "@/src/domain/equipment/equipment";

export const EQUIPOS_PER_PAGE = 25;

export const ESTADO_FILTERS = ["activos", ...EQUIPMENT_STATUS_KEYS] as const;
export type EstadoFilter = "activos" | EquipmentStatus;

export interface EquiposListQuery {
  q: string;
  /** "" = todas. */
  categoria: EquipmentCategory | "";
  estado: EstadoFilter;
  page: number;
  perPage: number;
}

const MAX_Q = 80;
/** Tope de página: evita offsets absurdos que PostgREST serializa mal (notación exponencial). */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

function oneOf<T extends string>(valid: readonly T[], raw: string | undefined, fallback: T): T {
  return valid.includes(raw as T) ? (raw as T) : fallback;
}

export function parseEquiposSearchParams(sp: Record<string, string | string[] | undefined>): EquiposListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    q: (first(sp.q) ?? "").trim().slice(0, MAX_Q),
    categoria: oneOf<EquipmentCategory | "">(EQUIPMENT_CATEGORY_KEYS, first(sp.cat), ""),
    estado: oneOf<EstadoFilter>(ESTADO_FILTERS, first(sp.estado), "activos"),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: EQUIPOS_PER_PAGE,
  };
}

/** Href de la lista con un parche; cambiar un filtro resetea la página salvo que se pida explícita. */
export function equiposHref(base: EquiposListQuery, patch: Partial<EquiposListQuery> = {}): string {
  const merged = { ...base, ...patch };
  const changesFilter = (["q", "categoria", "estado"] as const).some((k) => k in patch);
  if (changesFilter && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.categoria) sp.set("cat", merged.categoria);
  if (merged.estado !== "activos") sp.set("estado", merged.estado);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/equipos?${qs}` : "/admin/equipos";
}
