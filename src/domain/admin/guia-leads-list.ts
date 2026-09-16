/**
 * Leads de la guía (/guia-dj) en el admin (puro, sin IO): búsqueda por email +
 * paginación en la URL (?q=&p=), y el CSV para llevarse la lista a la herramienta de
 * correo. Espejo de clientes-list.ts, sin orden configurable: la lista es cronológica.
 */
import type { GuideLeadSource } from "@/src/domain/guide/lead";
import { EMAIL_MAX } from "@/src/domain/contact/contact";

export const GUIA_LEADS_PER_PAGE = 25;

/** Fila tal como la lee el admin (y como sale al CSV). */
export interface GuideLeadRow {
  id: string;
  email: string;
  source: GuideLeadSource;
  requestCount: number;
  createdAt: string;
  lastRequestedAt: string;
  lastDownloadedAt: string | null;
}

export interface GuiaLeadsListQuery {
  q: string;
  page: number;
  perPage: number;
}

/** Tope de página: evita offsets absurdos que PostgREST serializa mal (notación exponencial). */
const MAX_PAGE = 10_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseGuiaLeadsSearchParams(sp: Record<string, string | string[] | undefined>): GuiaLeadsListQuery {
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    q: (first(sp.q) ?? "").trim().slice(0, EMAIL_MAX),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: GUIA_LEADS_PER_PAGE,
  };
}

/** Href de la lista con un parche; cambiar la búsqueda resetea la página salvo que se pida explícita. */
export function guiaLeadsHref(base: GuiaLeadsListQuery, patch: Partial<GuiaLeadsListQuery> = {}): string {
  const merged = { ...base, ...patch };
  if ("q" in patch && !("page" in patch)) merged.page = 1;

  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/guia?${qs}` : "/admin/guia";
}

const CSV_HEADER = ["email", "origen", "pedidos", "primer_pedido", "ultimo_pedido", "descargada"];

/**
 * Celda CSV (RFC 4180): comillas dobles si hay coma, comillas o salto de línea.
 * Además neutraliza fórmulas: un email que empiece con = + - @ abriría una fórmula
 * en Excel/Sheets (CSV injection) — se antepone un apóstrofo, que la planilla muestra
 * como texto.
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
      [r.email, r.source, r.requestCount, r.createdAt, r.lastRequestedAt, r.lastDownloadedAt ?? "no"].map(cell).join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
