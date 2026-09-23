import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_SLUGS, GUIDE_SLUG_RE, isGuideSlug } from "./guides";
import { GUIDE_LEAD_CAPS, GUIDE_SOURCE_RE } from "@/src/domain/guide/lead";

const entries = GUIDE_SLUGS.map((s) => [s, GUIDES[s]] as const);

describe("registro de guías", () => {
  it("hay al menos una y la clave del objeto coincide con su slug", () => {
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const [key, g] of entries) expect(g.slug).toBe(key);
  });

  it("todo slug pasa el MISMO CHECK que la base", () => {
    // Espejo de guide_leads_guide_slug_valid: un slug que la base rechaza sería un lead
    // que se pierde en runtime, no un error de build.
    for (const [, g] of entries) {
      expect(GUIDE_SLUG_RE.test(g.slug), g.slug).toBe(true);
      expect(g.slug.length).toBeGreaterThanOrEqual(3);
      expect(g.slug.length).toBeLessThanOrEqual(GUIDE_LEAD_CAPS.guide);
    }
  });

  it("slugs, rutas y objetos de PDF son únicos", () => {
    const uniq = (xs: string[]) => new Set(xs).size === xs.length;
    expect(uniq(entries.map(([, g]) => g.slug))).toBe(true);
    expect(uniq(entries.map(([, g]) => g.path))).toBe(true);
    expect(uniq(entries.map(([, g]) => g.pdfObject))).toBe(true);
  });

  /**
   * /guia-dj está RANKEADA, enlazada desde el footer y desde /aprender-dj. Su ruta no se
   * deriva del slug justamente para que nadie la "normalice" sin darse cuenta.
   */
  it("la ruta de guia-dj es exactamente /guia-dj", () => {
    expect(GUIDES["guia-dj"].path).toBe("/guia-dj");
  });

  /**
   * La clave HISTÓRICA del PDF, en la raíz del bucket.
   *
   * signedDownloadUrl trata un 404 como ESTADO y no como error: re-keyear esto sin
   * re-subir el archivo en prod, staging y local rompería EN SILENCIO todos los links
   * durables ya enviados, y nadie se enteraría hasta que alguien reclame.
   * (Esta aserción vivía en guide-service.test.ts, cuando la clave era una constante.)
   */
  it("el PDF de guia-dj conserva su clave histórica", () => {
    expect(GUIDES["guia-dj"].pdfObject).toBe("guia-iniciacion-djing.pdf");
  });

  it("todo pdfObject termina en .pdf (el bucket solo acepta PDF)", () => {
    for (const [, g] of entries) expect(g.pdfObject.endsWith(".pdf"), g.pdfObject).toBe(true);
  });

  it("toda ruta es absoluta", () => {
    for (const [, g] of entries) expect(g.path.startsWith("/"), g.path).toBe(true);
  });

  it("cada guía declara al menos un formulario, con ids únicos y válidos para la base", () => {
    for (const [, g] of entries) {
      expect(g.sources.length).toBeGreaterThanOrEqual(1);
      const ids = g.sources.map((s) => s.id);
      expect(new Set(ids).size, `${g.slug}: ids repetidos`).toBe(ids.length);
      for (const s of g.sources) {
        // Espejo de guide_leads_source_valid.
        expect(GUIDE_SOURCE_RE.test(s.id), `${g.slug}/${s.id}`).toBe(true);
        expect(s.id.length).toBeGreaterThanOrEqual(2);
        expect(s.id.length).toBeLessThanOrEqual(GUIDE_LEAD_CAPS.source);
        expect(s.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("la clave de bitácora es guideDelivery:<slug>", () => {
    // Así `like 'guideDelivery%'` trae todas las entregas y el slug distingue cuál rebota.
    for (const [, g] of entries) expect(g.email.templateKey).toBe(`guideDelivery:${g.slug}`);
  });

  it("el correo de cada guía trae todo lo que la plantilla necesita", () => {
    for (const [, g] of entries) {
      for (const k of ["subject", "preheader", "h1", "blurb", "ctaLabel", "name"] as const) {
        expect(g.email[k].length, `${g.slug}.email.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("isGuideSlug no se deja engañar por propiedades de Object.prototype", () => {
    expect(isGuideSlug("guia-dj")).toBe(true);
    expect(isGuideSlug("toString")).toBe(false);
    expect(isGuideSlug("constructor")).toBe(false);
    expect(isGuideSlug("no-existe")).toBe(false);
  });

  it("se dice 'aislada acústicamente', nunca 'insonorizada'", () => {
    expect(JSON.stringify(GUIDES)).not.toMatch(/insonoriz/i);
  });
});
