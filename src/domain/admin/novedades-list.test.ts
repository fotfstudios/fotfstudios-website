import { describe, expect, it } from "vitest";
import {
  type NewsletterSubscriberRow,
  novedadesCsv,
  novedadesHref,
  parseNovedadesSearchParams,
} from "./novedades-list";

const row = (over: Partial<NewsletterSubscriberRow> = {}): NewsletterSubscriberRow => ({
  id: "1",
  email: "ana@example.com",
  source: "curso_dj",
  requestCount: 1,
  createdAt: "2026-09-25T12:00:00Z",
  consentAt: "2026-09-25T12:00:00Z",
  unsubscribedAt: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrerHost: null,
  ...over,
});

describe("parseNovedadesSearchParams", () => {
  it("por defecto: activos, página 1", () => {
    expect(parseNovedadesSearchParams({})).toEqual({ q: "", estado: "activos", page: 1, perPage: 25 });
  });

  it("estado desconocido cae a activos; página se acota", () => {
    const q = parseNovedadesSearchParams({ e: "raro", p: "99999999" });
    expect(q.estado).toBe("activos");
    expect(q.page).toBe(10_000);
  });

  it("lee bajas y la búsqueda", () => {
    expect(parseNovedadesSearchParams({ e: "bajas", q: " ana " })).toMatchObject({ estado: "bajas", q: "ana" });
  });
});

describe("novedadesHref", () => {
  const base = parseNovedadesSearchParams({ p: "3" });
  it("cambiar estado resetea la página y omite el default", () => {
    expect(novedadesHref(base, { estado: "bajas" })).toBe("/admin/novedades?e=bajas");
    expect(novedadesHref({ ...base, page: 1 })).toBe("/admin/novedades");
  });
  it("paginar conserva filtros", () => {
    expect(novedadesHref({ ...base, q: "ana" }, { page: 2 })).toBe("/admin/novedades?q=ana&p=2");
  });
});

describe("novedadesCsv", () => {
  it("solo exporta activos, con BOM y CRLF", () => {
    const csv = novedadesCsv([row(), row({ id: "2", email: "baja@example.com", unsubscribedAt: "2026-09-26T00:00:00Z" })]);
    expect(csv.startsWith("﻿email,")).toBe(true);
    expect(csv).toContain("ana@example.com");
    expect(csv).not.toContain("baja@example.com");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("neutraliza fórmulas y escapa comillas", () => {
    const csv = novedadesCsv([row({ utmCampaign: '=HYPERLINK("x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
