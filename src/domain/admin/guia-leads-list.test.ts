import { describe, expect, it } from "vitest";
import {
  GUIA_LEADS_PER_PAGE,
  guiaLeadsCsv,
  guiaLeadsHref,
  parseGuiaLeadsSearchParams,
  type GuideLeadRow,
} from "./guia-leads-list";

/** Los slugs entran por argumento: este módulo es puro y no conoce lib/guides. */
const SLUGS = ["guia-dj", "guia-mezcla"];
const parse = (sp: Record<string, string | string[] | undefined>) => parseGuiaLeadsSearchParams(sp, SLUGS);

const row = (over: Partial<GuideLeadRow> = {}): GuideLeadRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  email: "dj@correo.cl",
  guideSlug: "guia-dj",
  source: "hero",
  requestCount: 1,
  createdAt: "2026-09-15T23:14:22.691Z",
  lastRequestedAt: "2026-09-15T23:14:22.691Z",
  lastDownloadedAt: null,
  consentAt: "2026-09-15T23:14:22.691Z",
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  referrerHost: null,
  ...over,
});

const HEADER =
  "guia,email,origen,pedidos,primer_pedido,ultimo_pedido,descargada,consentimiento," +
  "utm_source,utm_medium,utm_campaign,utm_content,utm_term,referente";

describe("parseGuiaLeadsSearchParams", () => {
  it("por defecto: sin búsqueda, todas las guías, página 1, 25 por página", () => {
    expect(parse({})).toEqual({ q: "", guide: null, page: 1, perPage: GUIA_LEADS_PER_PAGE });
    expect(GUIA_LEADS_PER_PAGE).toBe(25);
  });

  it("q se recorta y se acota al largo de un email (120)", () => {
    expect(parse({ q: "  dj@correo " }).q).toBe("dj@correo");
    expect(parse({ q: "a".repeat(200) }).q).toHaveLength(120);
    expect(parse({ q: ["x", "y"] }).q).toBe("x");
  });

  it("p inválida o < 1 → 1; se clampa a un tope sano", () => {
    expect(parse({ p: "abc" }).page).toBe(1);
    expect(parse({ p: "0" }).page).toBe(1);
    expect(parse({ p: "3" }).page).toBe(3);
    expect(parse({ p: "1e99" }).page).toBeLessThanOrEqual(10_000);
  });

  it("g solo vale si la guía existe; cualquier otra cosa cae a 'todas'", () => {
    // Filtrar por una guía inexistente mostraría una tabla vacía sin explicación.
    expect(parse({ g: "guia-mezcla" }).guide).toBe("guia-mezcla");
    expect(parse({ g: "no-existe" }).guide).toBeNull();
    expect(parse({ g: "" }).guide).toBeNull();
    expect(parse({ g: ["guia-dj", "otra"] }).guide).toBe("guia-dj");
  });
});

describe("guiaLeadsHref", () => {
  const base = parse({ q: "dj", p: "3" });

  it("omite los defaults y conserva el resto", () => {
    expect(guiaLeadsHref(parse({}))).toBe("/admin/guia");
    expect(guiaLeadsHref(base)).toBe("/admin/guia?q=dj&p=3");
  });

  it("cambiar la búsqueda resetea la página; pedir una página explícita no", () => {
    expect(guiaLeadsHref(base, { q: "otro" })).toBe("/admin/guia?q=otro");
    expect(guiaLeadsHref(base, { page: 5 })).toBe("/admin/guia?q=dj&p=5");
  });

  it("cambiar de guía también resetea la página, pero conserva la búsqueda", () => {
    // La página 7 de "todas" casi nunca existe dentro de una guía sola.
    expect(guiaLeadsHref(base, { guide: "guia-mezcla" })).toBe("/admin/guia?q=dj&g=guia-mezcla");
    expect(guiaLeadsHref(parse({ g: "guia-dj", p: "4" }), { guide: null })).toBe("/admin/guia");
  });

  it("buscar dentro de una guía conserva el filtro", () => {
    expect(guiaLeadsHref(parse({ g: "guia-dj" }), { q: "ana" })).toBe("/admin/guia?q=ana&g=guia-dj");
  });
});

describe("guiaLeadsCsv", () => {
  it("BOM + cabecera con la guía PRIMERA + una fila por lead", () => {
    // `guia` primera para que un orden simple en Excel agrupe por guía sin configurar nada.
    const csv = guiaLeadsCsv([
      row(),
      row({
        email: "b@correo.cl",
        guideSlug: "guia-mezcla",
        source: "cierre",
        requestCount: 3,
        lastDownloadedAt: "2026-09-16T00:20:00.000Z",
        utmSource: "instagram",
        referrerHost: "www.google.com",
      }),
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe(
      "guia-dj,dj@correo.cl,hero,1,2026-09-15T23:14:22.691Z,2026-09-15T23:14:22.691Z,no,2026-09-15T23:14:22.691Z,,,,,,",
    );
    expect(lines[2]).toBe(
      "guia-mezcla,b@correo.cl,cierre,3,2026-09-15T23:14:22.691Z,2026-09-15T23:14:22.691Z,2026-09-16T00:20:00.000Z,2026-09-15T23:14:22.691Z,instagram,,,,,www.google.com",
    );
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

  it("el guard de fórmulas también cubre los UTM, que vienen de la query string", () => {
    // Este guard pasó a ser load-bearing para seis columnas nuevas, no solo el email.
    const csv = guiaLeadsCsv([row({ utmCampaign: "=cmd()", referrerHost: "+evil", utmTerm: "@x" })]);
    expect(csv).toContain("'=cmd()");
    expect(csv).toContain("'+evil");
    expect(csv).toContain("'@x");
  });

  it("sin leads: solo la cabecera", () => {
    expect(guiaLeadsCsv([])).toBe(`﻿${HEADER}\r\n`);
  });
});
