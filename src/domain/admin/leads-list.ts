/**
 * Lista del CRM de leads para el admin (puro, sin IO). Filtra por etapa del embudo y busca por
 * correo/nombre; la etapa, la búsqueda, la página y la vista (lista/tablero) viven en la URL.
 * Deriva además el estado de nurture de cada ficha (no inscrito / activo en paso N / completo /
 * dado de baja) para mostrarlo sin lógica en la UI.
 */
import { LEAD_STAGES, type LeadStage, isLeadStage } from "@/src/domain/outreach/pipeline";
import { NURTURE_STEPS, nextStepDue, type NurtureLead } from "@/src/domain/outreach/nurture-schedule";

export const LEADS_PER_PAGE = 25;
const MAX_PAGE = 10_000;

export type LeadsView = "lista" | "tablero";

export interface LeadsListQuery {
  stage: LeadStage | null;
  q: string | null;
  page: number;
  perPage: number;
  view: LeadsView;
}

/** Fila de la tabla/tablero. `touchCount` y `assigneeEmail` los arma el repo con joins. */
export interface LeadListRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  stage: LeadStage;
  assigneeMemberId: string | null;
  assigneeEmail: string | null;
  createdAt: string;
  touchCount: number;
  // Campos de nurture para derivar el estado.
  enrolledAt: string | null;
  consentAt: string | null;
  unsubscribedAt: string | null;
  tipSentAt: string | null;
  trialSentAt: string | null;
  courseSentAt: string | null;
  checkinSentAt: string | null;
}

/** Un toque de la historia de atribución (timeline del detalle). */
export interface LeadTouchView {
  id: string;
  occurredAt: string;
  kind: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  detail: Record<string, unknown> | null;
}

/** Ficha completa para el detalle: la fila + email del asignado + la historia de toques. */
export interface LeadDetailView extends LeadListRow {
  notes: string | null;
  stageUpdatedAt: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerHost: string | null;
  touches: LeadTouchView[];
}

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseLeadsSearchParams(sp: Record<string, string | string[] | undefined>): LeadsListQuery {
  const rawStage = first(sp.etapa);
  const rawView = first(sp.vista);
  const q = (first(sp.q) ?? "").trim();
  const page = Number.parseInt(first(sp.p) ?? "", 10);
  return {
    stage: isLeadStage(rawStage) ? rawStage : null,
    q: q === "" ? null : q.slice(0, 120),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    perPage: LEADS_PER_PAGE,
    view: rawView === "tablero" ? "tablero" : "lista",
  };
}

/** Href canónico: omite defaults (sin etapa, página 1, vista lista) y resetea la página al filtrar. */
export function leadsHref(base: LeadsListQuery, patch: Partial<LeadsListQuery> = {}): string {
  const merged = { ...base, ...patch };
  if (("stage" in patch || "q" in patch || "view" in patch) && !("page" in patch)) merged.page = 1;
  const sp = new URLSearchParams();
  if (merged.stage) sp.set("etapa", merged.stage);
  if (merged.q) sp.set("q", merged.q);
  if (merged.view === "tablero") sp.set("vista", "tablero");
  if (merged.page > 1) sp.set("p", String(merged.page));
  const qs = sp.toString();
  return qs ? `/admin/leads?${qs}` : "/admin/leads";
}

export type NurtureState = "no_inscrito" | "activo" | "completo" | "baja";

/** Estado de nurture de una ficha, para una pastilla. `step` = próximo paso pendiente (activo). */
export function nurtureStatus(row: NurtureLead): { state: NurtureState; label: string } {
  if (row.unsubscribedAt) return { state: "baja", label: "Dado de baja" };
  if (!row.consentAt) return { state: "no_inscrito", label: "No inscrito" };
  const sent = [row.tipSentAt, row.trialSentAt, row.courseSentAt, row.checkinSentAt].filter(Boolean).length;
  if (sent >= NURTURE_STEPS.length) return { state: "completo", label: "Secuencia completa" };
  // Próximo paso (sin importar si ya venció): da una etiqueta útil ("Paso 2 de 4").
  const next = nextStepDue({ ...row, enrolledAt: row.enrolledAt ?? "1970-01-01T00:00:00Z" }, new Date(8.64e15));
  const idx = next ? NURTURE_STEPS.findIndex((s) => s.key === next) : sent;
  return { state: "activo", label: `Paso ${Math.min(idx + 1, NURTURE_STEPS.length)} de ${NURTURE_STEPS.length}` };
}

const STAGE_LABEL_CSV: Record<LeadStage, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  ganado: "Ganado",
  perdido: "Perdido",
};

/** CSV UTF-8 con BOM y CRLF (como guiaLeadsCsv), para la herramienta de correo / planilla. */
export function leadsCsv(rows: LeadListRow[]): string {
  const esc = (v: string | null): string => {
    const s = v ?? "";
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Correo", "Nombre", "Teléfono", "Origen", "Etapa", "Asignado", "Nurture", "Alta"];
  const lines = rows.map((r) =>
    [
      esc(r.email),
      esc(r.name),
      esc(r.phone),
      esc(r.source),
      esc(STAGE_LABEL_CSV[r.stage]),
      esc(r.assigneeEmail),
      esc(nurtureStatus(r).label),
      esc(r.createdAt.slice(0, 10)),
    ].join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}

export { LEAD_STAGES };
