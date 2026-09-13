import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrato de accesibilidad de las superficies-herramienta (admin + cuenta).
 * Mismo enfoque que lib/chrome-contract.test.ts: no hay harness de DOM, así que
 * se lee el código fuente y se afirman los invariantes que ningún lint detecta:
 *  - los tokens de texto secundario y borde de inputs cumplen WCAG (4.5:1 / 3:1)
 *    contra Ink e Ink-soft (fondo de filas en hover)
 *  - el texto de admin/cuenta usa bone-quiet, nunca bone-mute (3.78:1, falla AA)
 *  - los inputs tienen borde perceptible (1.4.11 no-text contrast)
 *  - los modales son <dialog> nativos (foco atrapado, Escape, foco restaurado)
 *  - cabeceras de tabla con scope, toasts de error persistentes
 */
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const tsxUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f))
    .sort();

const TOOL_DIRS = ["app/admin", "components/admin", "app/cuenta", "components/cuenta"];

/** Luminancia relativa (WCAG 2.x) de un color #rrggbb. */
function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function token(css: string, name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `token --color-${name} en globals.css`).not.toBeNull();
  return m![1];
}

describe("tokens (app/globals.css)", () => {
  const css = read("app/globals.css");
  const ink = token(css, "ink");
  const inkSoft = token(css, "ink-soft");

  it("bone-quiet es texto secundario legible: ≥ 4.5:1 sobre ink e ink-soft", () => {
    const quiet = token(css, "bone-quiet");
    expect(contrast(quiet, ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(quiet, inkSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("bone-quiet queda por debajo de bone-dim (jerarquía bone › dim › quiet › mute)", () => {
    const quiet = token(css, "bone-quiet");
    expect(luminance(quiet)).toBeLessThan(luminance(token(css, "bone-dim")));
    expect(luminance(quiet)).toBeGreaterThan(luminance(token(css, "bone-mute")));
  });

  it("ink-edge (borde de inputs) cumple 3:1 no-text sobre ink e ink-soft", () => {
    const edge = token(css, "ink-edge");
    expect(contrast(edge, ink)).toBeGreaterThanOrEqual(3);
    expect(contrast(edge, inkSoft)).toBeGreaterThanOrEqual(3);
  });
});

describe("texto secundario en admin + cuenta", () => {
  it("ningún .tsx usa text-bone-mute (ni con alpha ni en placeholder:) — es bone-quiet", () => {
    const offenders: string[] = [];
    for (const dir of TOOL_DIRS) {
      for (const f of tsxUnder(dir)) {
        const hits = read(f).match(/[\w:-]*text-bone-mute(\/\d+)?/g);
        if (hits) offenders.push(`${f}: ${[...new Set(hits)].join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("los ejes SVG del admin no rotulan con bone-mute", () => {
    expect(read("components/admin/ui/Bars.tsx")).not.toContain("--color-bone-mute");
  });
});

describe("inputs (components/admin/ui/styles.ts)", () => {
  const src = read("components/admin/ui/styles.ts");
  const inputCls = src.match(/export const inputCls =\s*([\s\S]*?);/)![1];

  it("tienen borde ink-edge, no hairline (1.17:1 era invisible)", () => {
    expect(inputCls).toContain("border-ink-edge");
    expect(inputCls).not.toContain("hairline");
  });

  it("conservan el foco visible en gold", () => {
    expect(inputCls).toContain("focus-visible:border-gold");
  });
});

describe("modales", () => {
  it("Dialog es un <dialog> nativo abierto con showModal() y con título asociado", () => {
    const src = read("components/admin/ui/Dialog.tsx");
    expect(src).toMatch(/<dialog\b/);
    expect(src).toContain("showModal()");
    expect(src).toContain("aria-labelledby");
    expect(src).not.toContain('role="dialog"');
  });

  it("el drawer móvil del Sidebar es un <dialog> nativo abierto con showModal()", () => {
    const src = read("components/admin/ui/Sidebar.tsx");
    expect(src).toMatch(/<dialog\b/);
    expect(src).toContain("showModal()");
  });
});

describe("tablas y toasts", () => {
  it('Th lleva scope="col"', () => {
    expect(read("components/admin/ui/DataTable.tsx")).toContain('scope="col"');
  });

  it("los toasts de error son role=alert, persisten y se pueden cerrar", () => {
    const src = read("components/admin/ui/Toaster.tsx");
    expect(src).toContain('"alert"');
    expect(src).toContain('aria-label="Cerrar"');
    // El auto-cierre existe solo para el tono ok: el timeout debe estar condicionado.
    expect(src).toMatch(/tone === "ok"[\s\S]*?setTimeout|setTimeout[\s\S]*?tone === "ok"/);
  });
});
