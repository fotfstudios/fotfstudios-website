/**
 * Filtros, orden y paginación de la lista de reservas del admin (puro, sin IO).
 * El estado vive en la URL (?estado=&q=&t=&orden=&p=); acá se parsea, valida
 * y se reconstruyen los hrefs. El repo consume `ReservasListQuery` tal cual.
 */

export const RESERVAS_PER_PAGE = 25;

export const RESERVA_TABS = ["todas", "confirmadas", "espera", "canceladas", "bloqueos"] as const;
export type ReservaTab = (typeof RESERVA_TABS)[number];

export const RESERVA_TIEMPOS = ["proximas", "pasadas", "todas"] as const;
export type ReservaTiempo = (typeof RESERVA_TIEMPOS)[number];

export const RESERVA_ORDENES = ["fecha", "monto", "creacion"] as const;
export type ReservaOrden = (typeof RESERVA_ORDENES)[number];

export interface ReservasListQuery {
  estado: ReservaTab;
  q: string;
  tiempo: ReservaTiempo;
  orden: ReservaOrden;
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

export function parseReservasSearchParams(
  sp: Record<string, string | string[] | undefined>,
): ReservasListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    estado: oneOf(RESERVA_TABS, first(sp.estado), "todas"),
    q: (first(sp.q) ?? "").trim().slice(0, MAX_Q),
    tiempo: oneOf(RESERVA_TIEMPOS, first(sp.t), "proximas"),
    orden: oneOf(RESERVA_ORDENES, first(sp.orden), "fecha"),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: RESERVAS_PER_PAGE,
  };
}

/**
 * Columna y dirección del ORDER BY. "fecha" deriva la dirección del tiempo:
 * próximas → ascendente (hoy primero); pasadas/todas → descendente.
 */
export function ordenSpec(q: Pick<ReservasListQuery, "orden" | "tiempo">): {
  column: string;
  ascending: boolean;
} {
  if (q.orden === "monto") return { column: "orders(amount_clp)", ascending: false };
  if (q.orden === "creacion") return { column: "created_at", ascending: false };
  return { column: "starts_at", ascending: q.tiempo === "proximas" };
}

/**
 * Sanea la aguja de búsqueda para el DSL de `.or()` de PostgREST: escapa los
 * comodines de ILIKE (\ % _) y reemplaza por espacio los delimitadores de la
 * gramática (, ( ) ") y `*` — que PostgREST reescribe a `%` ANTES de llegar a
 * Postgres, así que no se puede escapar con backslash. Una aguja hostil
 * filtra de más, nunca rompe ni sobre-matchea.
 */
export function escapeIlike(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, (c) => `\\${c}`)
    .replace(/[,()"*]/g, " ")
    .trim();
}

/**
 * Href canónico de la lista: omite los valores por defecto y resetea la página
 * al cambiar cualquier filtro (salvo que el patch pida una página explícita).
 */
export function reservasHref(base: ReservasListQuery, patch: Partial<ReservasListQuery> = {}): string {
  const merged = { ...base, ...patch };
  const changesFilter = (["estado", "q", "tiempo", "orden"] as const).some((k) => k in patch);
  if (changesFilter && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.estado !== "todas") sp.set("estado", merged.estado);
  if (merged.q) sp.set("q", merged.q);
  if (merged.tiempo !== "proximas") sp.set("t", merged.tiempo);
  if (merged.orden !== "fecha") sp.set("orden", merged.orden);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/reservas?${qs}` : "/admin/reservas";
}
