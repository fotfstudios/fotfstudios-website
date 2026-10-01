import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lo que sostiene el ranking local de /curso-dj ("curso de dj viña del mar",
 * "clases de dj"). Si una edición de copy rompe algo de esto, que sea a propósito.
 */
const DIR = join(process.cwd(), "app/(marketing)/curso-dj");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

describe("/curso-dj: contrato SEO", () => {
  const page = read("page.tsx");

  it("el JSON-LD sale escapado por jsonLdHtml, nunca con JSON.stringify crudo", () => {
    expect(page).toContain("jsonLdHtml(jsonLd)");
    expect(page).not.toMatch(/__html:\s*JSON\.stringify/);
  });

  it("la meta description abierta cabe en el snippet (≤155) y nombra curso + ciudad", () => {
    const m = page.match(/const DESCRIPTION =\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    const d = m![1];
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).toContain("Curso de DJ");
    expect(d).toContain("Viña del Mar");
  });

  it("el H1 lleva la búsqueda principal: curso de DJ + Viña del Mar", () => {
    const h1 = read("_components/DsHero.tsx").match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(h1![1]).toContain("Curso de DJ");
    expect(h1![1]).toContain("Viña del Mar");
  });

  it("el Course tiene @id (lo referencia la home), nivel y la dirección completa del proveedor", () => {
    expect(page).toContain("/curso-dj#curso");
    expect(page).toContain('educationalLevel: "Beginner"');
    expect(page).toContain("streetAddress: STREET");
  });

  it("monta Dónde, Testimonios y Lecturas en la versión abierta", () => {
    for (const c of ["<DsDonde />", "<DsTestimonios />", "<DsLecturas />"]) expect(page).toContain(c);
  });
});
