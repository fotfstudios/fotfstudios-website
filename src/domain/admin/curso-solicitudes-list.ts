/**
 * Bandeja de solicitudes del curso en el admin (puro, sin IO). Misma forma simple
 * que postulaciones-list: solo tabs por estado con conteos y paginación, sin
 * búsqueda ni orden configurable. Con 6 cupos por generación, filtrar de más sería
 * ceremonia. El estado vive en la URL (?estado=&p=).
 */
import type { CourseLeadStatus } from "@/src/domain/course/course";

export const SOLICITUDES_PER_PAGE = 25;

export const SOLICITUD_TABS = ["nuevas", "contactadas", "inscritas", "descartadas", "todas"] as const;
export type SolicitudTab = (typeof SOLICITUD_TABS)[number];

/** Tab → estado de la DB para el filtro (todas → sin filtro). */
export const TAB_TO_LEAD_STATUS: Record<SolicitudTab, CourseLeadStatus | null> = {
  nuevas: "nueva",
  contactadas: "contactada",
  inscritas: "inscrita",
  descartadas: "descartada",
  todas: null,
};

export interface SolicitudesListQuery {
  estado: SolicitudTab;
  page: number;
  perPage: number;
}

/** Tope de página: evita offsets absurdos que PostgREST serializa mal. */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseSolicitudesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): SolicitudesListQuery {
  const rawTab = first(sp.estado);
  const estado = (SOLICITUD_TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as SolicitudTab)
    : "nuevas";
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    estado,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: SOLICITUDES_PER_PAGE,
  };
}

/**
 * Href canónico: omite el default (nuevas / página 1) y resetea la página al
 * cambiar de tab (salvo que el patch pida una página explícita).
 */
export function solicitudesHref(
  base: SolicitudesListQuery,
  patch: Partial<SolicitudesListQuery> = {},
): string {
  const merged = { ...base, ...patch };
  if ("estado" in patch && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.estado !== "nuevas") sp.set("estado", merged.estado);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/curso/solicitudes?${qs}` : "/admin/curso/solicitudes";
}
