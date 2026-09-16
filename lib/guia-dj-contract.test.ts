import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato de la landing /guia-dj (portada de la Guía de iniciación al DJing).
 *
 * Pinea las decisiones de diseño que no se ven en un build verde: landing sin Nav (una
 * sola acción: el correo), Sirena solo en la píldora GRATIS y el botón de envío, los
 * tres formularios con `source` distinto compartiendo el estado LISTO, `booth-glow`
 * reservado a /curso-dj, y la página de descarga fuera del índice.
 */
const ROOT = process.cwd();
const DIR = "app/(marketing)/guia-dj";
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const tsxUnder = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (rel.endsWith(".tsx")) out.push(rel);
    }
  };
  if (existsSync(join(ROOT, dir))) walk(dir);
  return out;
};

describe("app/(marketing)/guia-dj/page.tsx", () => {
  const src = () => read(`${DIR}/page.tsx`);

  it("es una landing: sin <Nav />, con <Footer />, canónica /guia-dj y FAQPage + breadcrumb", () => {
    expect(src()).not.toMatch(/<Nav\b/);
    expect(src()).toMatch(/<Footer\s*\/>/);
    expect(src()).toContain('canonical: "/guia-dj"');
    expect(src()).toContain('"@type": "FAQPage"');
    expect(src()).toContain('"@type": "BreadcrumbList"');
  });

  it("el copy sale de lib/guia-content, nunca de un _content local", () => {
    expect(src()).toMatch(/from "@\/lib\/guia-content"/);
    expect(existsSync(join(ROOT, `${DIR}/_content.ts`))).toBe(false);
  });
});

describe("formularios de la guía", () => {
  it("hay exactamente tres LeadForm, uno por origen (hero, fragmento, cierre)", () => {
    const sources = tsxUnder(DIR)
      .flatMap((f) => [...read(f).matchAll(/<LeadForm\b[^>]*\bsource="([a-z]+)"/g)].map((m) => m[1]))
      .sort();
    expect(sources).toEqual(["cierre", "fragmento", "hero"]);
  });

  it("los tres comparten el estado LISTO vía el provider (y el provider envuelve el main)", () => {
    expect(read(`${DIR}/page.tsx`)).toMatch(/<GuiaLeadProvider>\s*<main/);
    expect(read(`${DIR}/_components/LeadForm.tsx`)).toMatch(/useGuiaLead\(\)/);
  });
});

describe("marca", () => {
  it("Sirena solo en la píldora GRATIS y el botón de envío (+ errores de validación)", () => {
    const hits = tsxUnder(DIR).flatMap((f) => [...read(f).matchAll(/[\w-]*sirena[\w/-]*/g)].map((m) => `${f}: ${m[0]}`));
    // Píldora y botón viven en LeadForm/GuiaHero; los errores usan text-sirena/border-sirena.
    for (const h of hits) expect(h).toMatch(/GuiaHero\.tsx: bg-sirena|LeadForm\.tsx: (bg-sirena|text-sirena|border-sirena)/);
    expect(hits.some((h) => h.includes("LeadForm.tsx: bg-sirena"))).toBe(true);
  });

  it("booth-glow sigue siendo solo de /curso-dj", () => {
    for (const f of tsxUnder(DIR)) expect(read(f), f).not.toContain("booth-glow");
  });
});

describe("app/(marketing)/guia-dj/descarga/[token]/page.tsx", () => {
  it("no se indexa y resuelve por guideService (notFound / redirect)", () => {
    const src = read(`${DIR}/descarga/[token]/page.tsx`);
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(src).toContain("resolveDownload(");
    expect(src).toContain("notFound()");
    expect(src).toContain("redirect(");
  });
});
