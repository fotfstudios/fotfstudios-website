/**
 * Búsqueda, orden y paginación del directorio de clientes del admin (puro, sin
 * IO). El estado vive en la URL (?q=&orden=&p=); acá se parsea, valida y se
 * reconstruyen los hrefs. Espejo de `reservas-list.ts`, con menos filtros.
 */

export const CLIENTES_PER_PAGE = 25;

export const CLIENTE_ORDENES = ["recientes", "nombre", "puntos"] as const;
export type ClienteOrden = (typeof CLIENTE_ORDENES)[number];

export interface ClientesListQuery {
  q: string;
  orden: ClienteOrden;
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

export function parseClientesSearchParams(sp: Record<string, string | string[] | undefined>): ClientesListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    q: (first(sp.q) ?? "").trim().slice(0, MAX_Q),
    orden: oneOf(CLIENTE_ORDENES, first(sp.orden), "recientes"),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: CLIENTES_PER_PAGE,
  };
}

/** Columna y dirección del ORDER BY. El desempate por `id` lo agrega el repo. */
export function clientesOrdenSpec(orden: ClienteOrden): { column: string; ascending: boolean } {
  switch (orden) {
    case "nombre":
      return { column: "name_norm", ascending: true };
    case "puntos":
      return { column: "points_balance", ascending: false };
    default:
      return { column: "created_at", ascending: false };
  }
}

/** Href de la lista con un parche; cambiar un filtro resetea la página salvo que se pida explícita. */
export function clientesHref(base: ClientesListQuery, patch: Partial<ClientesListQuery> = {}): string {
  const merged = { ...base, ...patch };
  const changesFilter = (["q", "orden"] as const).some((k) => k in patch);
  if (changesFilter && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.orden !== "recientes") sp.set("orden", merged.orden);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/clientes?${qs}` : "/admin/clientes";
}
