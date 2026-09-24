import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";

/**
 * Contrato de la landing /guia-pendrive-dj (guía #2, portada de Claude Design "Landing
 * Guia Pendrive"). Pinea lo que la traducción a la marca decidió y un build verde no ve:
 * sin Nav, Sirena solo en la píldora GRATIS (el botón y los errores viven en el
 * LeadForm compartido, que pinea guia-dj-contract), el acento en Gold, "aislada
 * acústicamente" y nunca "insonorizada", los dos formularios que el registro declara, y
 * la página de descarga fuera del índice.
 */
const ROOT = process.cwd();
const DIR = "app/(marketing)/guia-pendrive-dj";
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

describe("app/(marketing)/guia-pendrive-dj/page.tsx", () => {
  const src = () => read(`${DIR}/page.tsx`);

  it("es una landing: sin <Nav />, con <Footer />, canónica propia y breadcrumb escapado", () => {
    expect(src()).not.toMatch(/<Nav\b/);
    expect(src()).toMatch(/<Footer\s*\/>/);
    expect(src()).toMatch(/const PATH = "\/guia-pendrive-dj"/);
    expect(src()).toMatch(/pageMetadata\(\{[\s\S]*?path: PATH/);
    expect(src()).toContain('"@type": "BreadcrumbList"');
    expect(src()).toContain("jsonLdHtml(");
  });

  it("el copy sale de lib/guia-pendrive-content, y la ruta coincide con el registro", () => {
    expect(src()).toMatch(/from "@\/lib\/guia-pendrive-content"/);
    expect(GUIDES["guia-pendrive-dj"].path).toBe("/guia-pendrive-dj");
  });

  it("el provider envuelve el main y lleva el copy del formulario", () => {
    expect(src()).toMatch(/<GuiaLeadProvider copy=\{COPY\.form\}>\s*<main/);
  });
});

describe("formularios", () => {
  it("un LeadForm por cada origen que declara el registro, todos de esta guía", () => {
    const forms = tsxUnder(DIR).flatMap((f) => [...read(f).matchAll(/<LeadForm\b[^>]*>/g)].map((m) => m[0]));
    const sources = forms.map((f) => f.match(/\bsource="([a-z_]+)"/)?.[1]).sort();
    expect(sources).toEqual(GUIDES["guia-pendrive-dj"].sources.map((s) => s.id).sort());
    for (const f of forms) expect(f).toContain('guide="guia-pendrive-dj"');
  });
});

describe("marca", () => {
  it("Sirena solo en la píldora GRATIS del hero", () => {
    const hits = tsxUnder(DIR).flatMap((f) => [...read(f).matchAll(/[\w-]*sirena[\w/-]*/g)].map((m) => `${f}: ${m[0]}`));
    expect(hits).toEqual([`${DIR}/_components/PendriveHero.tsx: bg-sirena`]);
  });

  it("nunca 'insonorizada' (landing ni copy); booth-glow sigue siendo de /curso-dj", () => {
    for (const f of [...tsxUnder(DIR), "lib/guia-pendrive-content.ts"]) {
      expect(read(f), f).not.toMatch(/insonoriz/i);
      expect(read(f), f).not.toContain("booth-glow");
    }
  });
});

describe("app/(marketing)/guia-pendrive-dj/descarga/[token]/page.tsx", () => {
  it("no se indexa y resuelve por guideService (notFound / redirect)", () => {
    const src = read(`${DIR}/descarga/[token]/page.tsx`);
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(src).toContain("resolveDownload(");
    expect(src).toContain("notFound()");
    expect(src).toContain("redirect(");
  });
});
