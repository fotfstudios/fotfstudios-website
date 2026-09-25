/**
 * Suscriptores del newsletter en el admin (puro, sin IO): búsqueda por email, filtro de
 * estado y paginación en la URL (?q=&e=&p=), y el CSV para llevarse la lista a la
 * herramienta de correo. Espejo de guia-leads-list.ts.
 */

import { EMAIL_MAX } from "@/src/domain/contact/contact";

export const NOVEDADES_PER_PAGE = 25;

export const NOVEDADES_ESTADOS = ["activos", "bajas", "todos"] as const;
export type NovedadesEstado = (typeof NOVEDADES_ESTADOS)[number];

/** Fila tal como la lee el admin (y como sale al CSV). */
export interface NewsletterSubscriberRow {
  id: string;
  email: string;
  source: string;
  requestCount: number;
  createdAt: string;
  /** Último consentimiento vigente (se renueva en un re-alta). */
  consentAt: string;
  unsubscribedAt: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerHost: string | null;
}

export interface NovedadesListQuery {
  q: string;
  estado: NovedadesEstado;
  page: number;
  perPage: number;
}

/** Tope de página: evita offsets absurdos que PostgREST serializa mal (notación exponencial). */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const isEstado = (s: string): s is NovedadesEstado => (NOVEDADES_ESTADOS as readonly string[]).includes(s);

/** Por defecto "activos": es la lista a la que se le escribe. */
export function parseNovedadesSearchParams(sp: Record<string, string | string[] | undefined>): NovedadesListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  const e = (first(sp.e) ?? "").trim();
  return {
    q: (first(sp.q) ?? "").trim().slice(0, EMAIL_MAX),
    estado: isEstado(e) ? e : "activos",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: NOVEDADES_PER_PAGE,
  };
}

/** Href de la lista con un parche; cambiar búsqueda o estado vuelve a la página 1. */
export function novedadesHref(base: NovedadesListQuery, patch: Partial<NovedadesListQuery> = {}): string {
  const merged = { ...base, ...patch };
  if (("q" in patch || "estado" in patch) && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.estado !== "activos") sp.set("e", merged.estado);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/novedades?${qs}` : "/admin/novedades";
}

const CSV_HEADER = [
  "email",
  "origen",
  "altas",
  "primera_alta",
  "consentimiento",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referente",
];

/**
 * Celda CSV (RFC 4180) con fórmulas neutralizadas: los UTM y el referente vienen de la
 * query string, o sea del atacante (misma regla que guia-leads-list.ts).
 */
function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV UTF-8 con BOM y CRLF. Solo lleva suscriptores ACTIVOS aunque le pasen otros: es la
 * lista a la que se le va a escribir, y mandarle correo a alguien que se dio de baja es
 * justo lo que la baja promete que no pasa.
 */
export function novedadesCsv(rows: readonly NewsletterSubscriberRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    if (r.unsubscribedAt) continue;
    lines.push(
      [
        r.email,
        r.source,
        r.requestCount,
        r.createdAt,
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
