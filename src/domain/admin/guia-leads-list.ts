/**
 * Leads de las guías en el admin (puro, sin IO): búsqueda por email +
 * paginación en la URL (?q=&p=), y el CSV para llevarse la lista a la herramienta de
 * correo. Espejo de clientes-list.ts, sin orden configurable: la lista es cronológica.
 */

import { EMAIL_MAX } from "@/src/domain/contact/contact";

export const GUIA_LEADS_PER_PAGE = 25;

/** Fila tal como la lee el admin (y como sale al CSV). */
export interface GuideLeadRow {
  id: string;
  email: string;
  /** A qué guía corresponde. La columna y el filtro del admin llegan aparte. */
  guideSlug: string;
  /** Ya no es una unión cerrada: cada guía declara sus formularios en lib/guides.ts. */
  source: string;
  requestCount: number;
  createdAt: string;
  lastRequestedAt: string;
  lastDownloadedAt: string | null;
  /** Cuándo aceptó recibir correo. Primer toque, no se pisa en un re-pedido. */
  consentAt: string;
  /** Atribución de primer toque CON datos. Va al CSV, no a la tabla: seis columnas ya es el límite. */
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerHost: string | null;
}

export interface GuiaLeadsListQuery {
  q: string;
  /** Slug de la guía, o null = todas. */
  guide: string | null;
  page: number;
  perPage: number;
}

/** Tope de página: evita offsets absurdos que PostgREST serializa mal (notación exponencial). */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * `slugs` entra como argumento —no se importa lib/guides— para que este módulo siga
 * siendo puro. Una guía que no esté en la lista cae a "todas" en vez de filtrar por algo
 * inexistente y mostrar una tabla vacía sin explicación.
 */
export function parseGuiaLeadsSearchParams(
  sp: Record<string, string | string[] | undefined>,
  slugs: readonly string[],
): GuiaLeadsListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  const g = (first(sp.g) ?? "").trim();
  return {
    q: (first(sp.q) ?? "").trim().slice(0, EMAIL_MAX),
    guide: slugs.includes(g) ? g : null,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: GUIA_LEADS_PER_PAGE,
  };
}

/** Href de la lista con un parche; cambiar la búsqueda resetea la página salvo que se pida explícita. */
export function guiaLeadsHref(base: GuiaLeadsListQuery, patch: Partial<GuiaLeadsListQuery> = {}): string {
  const merged = { ...base, ...patch };
  // Cambiar el filtro o la búsqueda vuelve a la página 1: la 7 de "todas" casi nunca
  // existe dentro de una guía sola.
  if (("q" in patch || "guide" in patch) && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.guide) sp.set("g", merged.guide);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/guia?${qs}` : "/admin/guia";
}

/**
 * `guia` va PRIMERA: así un orden simple en Excel agrupa por guía sin configurar nada.
 * Los UTM y el consentimiento salen acá y no en la tabla — la tabla ya está en su ancho
 * máximo, y el destino de estos datos es la herramienta de correo.
 */
const CSV_HEADER = [
  "guia",
  "email",
  "origen",
  "pedidos",
  "primer_pedido",
  "ultimo_pedido",
  "descargada",
  "consentimiento",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referente",
];

/**
 * Celda CSV (RFC 4180): comillas dobles si hay coma, comillas o salto de línea.
 * Además neutraliza fórmulas: un valor que empiece con = + - @ abriría una fórmula
 * en Excel/Sheets (CSV injection) — se antepone un apóstrofo, que la planilla muestra
 * como texto.
 *
 * Esto pasó a ser LOAD-BEARING para seis columnas nuevas, no solo para el email: los UTM
 * y el referente vienen de la query string, o sea del atacante.
 */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV UTF-8 con BOM (para que Excel lea los acentos) y CRLF. */
export function guiaLeadsCsv(rows: readonly GuideLeadRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.guideSlug,
        r.email,
        r.source,
        r.requestCount,
        r.createdAt,
        r.lastRequestedAt,
        r.lastDownloadedAt ?? "no",
        r.consentAt,
        r.utmSource ?? "",
        r.utmMedium ?? "",
        r.utmCampaign ?? "",
        r.utmContent ?? "",
        r.utmTerm ?? "",
        r.referrerHost ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
