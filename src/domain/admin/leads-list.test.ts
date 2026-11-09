import { describe, it, expect } from "vitest";
import { parseLeadsSearchParams, leadsHref, leadsCsv, nurtureStatus, type LeadListRow } from "./leads-list";

const row = (over: Partial<LeadListRow> = {}): LeadListRow => ({
  id: "1",
  email: "ana@example.com",
  name: "Ana",
  phone: null,
  source: "guia:guia-pendrive-dj",
  stage: "nuevo",
  assigneeMemberId: null,
  assigneeEmail: null,
  createdAt: "2026-11-01T12:00:00.000Z",
  touchCount: 1,
  enrolledAt: null,
  consentAt: null,
  unsubscribedAt: null,
  tipSentAt: null,
  trialSentAt: null,
  courseSentAt: null,
  checkinSentAt: null,
  ...over,
});

describe("parseLeadsSearchParams", () => {
  it("toma defaults sanos", () => {
    const q = parseLeadsSearchParams({});
    expect(q).toMatchObject({ stage: null, q: null, page: 1, view: "lista" });
  });
  it("valida la etapa y la vista; ignora basura", () => {
    expect(parseLeadsSearchParams({ etapa: "ganado", vista: "tablero", p: "3" })).toMatchObject({
      stage: "ganado",
      view: "tablero",
      page: 3,
    });
    expect(parseLeadsSearchParams({ etapa: "won" }).stage).toBeNull();
  });
});

describe("leadsHref", () => {
  it("omite defaults y resetea la página al filtrar", () => {
    const base = parseLeadsSearchParams({ p: "4" });
    expect(leadsHref(base, { stage: "ganado" })).toBe("/admin/leads?etapa=ganado");
    expect(leadsHref(base, {})).toBe("/admin/leads?p=4");
  });
});

describe("nurtureStatus", () => {
  it("distingue no inscrito / baja / activo / completo", () => {
    expect(nurtureStatus(row()).state).toBe("no_inscrito");
    expect(nurtureStatus(row({ unsubscribedAt: "2026-11-02T00:00:00Z" })).state).toBe("baja");
    expect(nurtureStatus(row({ consentAt: "2026-11-01T12:00:00Z", enrolledAt: "2026-11-01T12:00:00Z" })).state).toBe("activo");
    const done = row({
      consentAt: "x",
      enrolledAt: "x",
      tipSentAt: "x",
      trialSentAt: "x",
      courseSentAt: "x",
      checkinSentAt: "x",
    });
    expect(nurtureStatus(done).state).toBe("completo");
  });
});

describe("leadsCsv — anti-inyección de fórmulas", () => {
  it("antepone un apóstrofo a una celda que empieza con = + - @", () => {
    const csv = leadsCsv([row({ name: "=HYPERLINK(1)", source: "+danger" })]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'+danger");
    // Nunca una celda cruda que arranque en '=' (fuera del BOM/encabezado).
    expect(csv).not.toMatch(/(^|,|\n)=HYPERLINK/);
  });
  it("escapa comillas y comas", () => {
    const csv = leadsCsv([row({ name: 'Ana, "DJ"' })]);
    expect(csv).toContain('"Ana, ""DJ"""');
  });
});
