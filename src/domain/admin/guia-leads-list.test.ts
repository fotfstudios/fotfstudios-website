import { describe, expect, it } from "vitest";
import {
  GUIA_LEADS_PER_PAGE,
  guiaLeadsCsv,
  guiaLeadsHref,
  parseGuiaLeadsSearchParams,
  type GuideLeadRow,
} from "./guia-leads-list";

const row = (over: Partial<GuideLeadRow> = {}): GuideLeadRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  email: "dj@correo.cl",
  source: "hero",
  requestCount: 1,
  createdAt: "2026-09-15T23:14:22.691Z",
  lastRequestedAt: "2026-09-15T23:14:22.691Z",
  lastDownloadedAt: null,
  ...over,
});

describe("parseGuiaLeadsSearchParams", () => {
  it("por defecto: sin búsqueda, página 1, 25 por página", () => {
    expect(parseGuiaLeadsSearchParams({})).toEqual({ q: "", page: 1, perPage: GUIA_LEADS_PER_PAGE });
    expect(GUIA_LEADS_PER_PAGE).toBe(25);
  });

  it("q se recorta y se acota al largo de un email (120)", () => {
    expect(parseGuiaLeadsSearchParams({ q: "  dj@correo " }).q).toBe("dj@correo");
    expect(parseGuiaLeadsSearchParams({ q: "a".repeat(200) }).q).toHaveLength(120);
    expect(parseGuiaLeadsSearchParams({ q: ["x", "y"] }).q).toBe("x");
  });

  it("p inválida o < 1 → 1; se clampa a un tope sano", () => {
    expect(parseGuiaLeadsSearchParams({ p: "abc" }).page).toBe(1);
    expect(parseGuiaLeadsSearchParams({ p: "0" }).page).toBe(1);
    expect(parseGuiaLeadsSearchParams({ p: "3" }).page).toBe(3);
    expect(parseGuiaLeadsSearchParams({ p: "1e99" }).page).toBeLessThanOrEqual(10_000);
  });
});

describe("guiaLeadsHref", () => {
  const base = parseGuiaLeadsSearchParams({ q: "dj", p: "3" });

  it("omite los defaults y conserva el resto", () => {
    expect(guiaLeadsHref(parseGuiaLeadsSearchParams({}))).toBe("/admin/guia");
    expect(guiaLeadsHref(base)).toBe("/admin/guia?q=dj&p=3");
  });

  it("cambiar la búsqueda resetea la página; pedir una página explícita no", () => {
    expect(guiaLeadsHref(base, { q: "otro" })).toBe("/admin/guia?q=otro");
    expect(guiaLeadsHref(base, { page: 5 })).toBe("/admin/guia?q=dj&p=5");
  });
});

describe("guiaLeadsCsv", () => {
  it("BOM + cabecera + una fila por lead, con fechas ISO y descarga como sí/no", () => {
    const csv = guiaLeadsCsv([row(), row({ email: "b@correo.cl", source: "cierre", requestCount: 3, lastDownloadedAt: "2026-09-16T00:20:00.000Z" })]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("email,origen,pedidos,primer_pedido,ultimo_pedido,descargada");
    expect(lines[1]).toBe("dj@correo.cl,hero,1,2026-09-15T23:14:22.691Z,2026-09-15T23:14:22.691Z,no");
    expect(lines[2]).toBe("b@correo.cl,cierre,3,2026-09-15T23:14:22.691Z,2026-09-15T23:14:22.691Z,2026-09-16T00:20:00.000Z");
    expect(lines).toHaveLength(4); // termina en CRLF
    expect(lines[3]).toBe("");
  });

  it("escapa comas, comillas y saltos de línea al estilo RFC 4180", () => {
    const csv = guiaLeadsCsv([row({ email: 'we"ird,mail\n@x.cl' })]);
    expect(csv).toContain('"we""ird,mail\n@x.cl",hero');
  });

  it("neutraliza fórmulas de planilla (= + - @ al inicio) para que Excel no las ejecute", () => {
    const csv = guiaLeadsCsv([row({ email: "=HYPERLINK(1)@x.cl" })]);
    expect(csv).toContain("'=HYPERLINK(1)@x.cl");
  });

  it("sin leads: solo la cabecera", () => {
    expect(guiaLeadsCsv([])).toBe("﻿email,origen,pedidos,primer_pedido,ultimo_pedido,descargada\r\n");
  });
});
