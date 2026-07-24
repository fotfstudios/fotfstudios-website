/**
 * Lista de postulaciones de DJ del admin (puro, sin IO). Deliberadamente más simple
 * que reservas-list: sin búsqueda, sin filtro de tiempo, sin orden configurable — solo
 * tabs por estado (con conteos) y paginación. El estado vive en la URL (?estado=&p=).
 */
import type { ApplicationStatus } from "@/src/domain/applications/application";

export const POSTULACIONES_PER_PAGE = 25;

export const POSTULACION_TABS = ["nuevas", "contactadas", "descartadas", "todas"] as const;
export type PostulacionTab = (typeof POSTULACION_TABS)[number];

/** Tab → estado de la DB para el filtro (todas → sin filtro). */
export const TAB_TO_STATUS: Record<PostulacionTab, ApplicationStatus | null> = {
  nuevas: "nueva",
  contactadas: "contactada",
  descartadas: "descartada",
  todas: null,
};

export interface PostulacionesListQuery {
  estado: PostulacionTab;
  page: number;
  perPage: number;
}

/** Tope de página: evita offsets absurdos que PostgREST serializa mal. */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parsePostulacionesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): PostulacionesListQuery {
  const rawTab = first(sp.estado);
  const estado = (POSTULACION_TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as PostulacionTab)
    : "nuevas";
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    estado,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: POSTULACIONES_PER_PAGE,
  };
}

/**
 * Href canónico: omite el default (nuevas / página 1) y resetea la página al cambiar
 * de tab (salvo que el patch pida una página explícita).
 */
export function postulacionesHref(
  base: PostulacionesListQuery,
  patch: Partial<PostulacionesListQuery> = {},
): string {
  const merged = { ...base, ...patch };
  if ("estado" in patch && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.estado !== "nuevas") sp.set("estado", merged.estado);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/postulaciones?${qs}` : "/admin/postulaciones";
}
