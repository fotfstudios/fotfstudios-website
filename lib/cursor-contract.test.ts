import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrato del cursor de cabina (play ▶ / pause ❚❚).
 *
 * Pinea lo que un build verde no ve: sin loop de persecución (el aro con rAF de #146
 * se colgaba), un solo glifo que sigue al puntero al instante, tres modos por CSS
 * (play / pause sobre interactivos / hidden sobre campos de texto, donde manda el
 * I-beam nativo), pulso "cue" al click, y el apagado bajo prefers-reduced-motion.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const tsx = () => read("components/CustomCursor.tsx");
const css = () => read("app/globals.css");

describe("components/CustomCursor.tsx", () => {
  it("no persigue al puntero con requestAnimationFrame: el glifo se mueve en cada mousemove", () => {
    expect(tsx()).not.toContain("requestAnimationFrame");
    expect(tsx()).toMatch(/translate3d\(/);
  });

  it("un solo elemento .cursor con los dos glifos (play y pause) como SVG", () => {
    expect(tsx()).toMatch(/className="cursor"/);
    expect(tsx()).toMatch(/className="cursor-glyph"/);
    expect(tsx()).toMatch(/className="cursor-play"/);
    expect(tsx()).toMatch(/className="cursor-pause"/);
    expect((tsx().match(/<svg/g) ?? []).length).toBe(2);
    expect(tsx()).not.toMatch(/cursor-dot|cursor-ring/);
  });

  it("modos: pause sobre interactivos (incluido summary), hidden sobre campos de texto, play por defecto", () => {
    expect(tsx()).toMatch(/"a, button, \[role='button'\][^"]*\bsummary\b[^"]*"/);
    expect(tsx()).toMatch(/"input, textarea[^"]*"/);
    expect((tsx().match(/\.closest\(/g) ?? []).length).toBe(2);
    for (const mode of ["play", "pause", "hidden"]) expect(tsx()).toContain(`"${mode}"`);
    expect(tsx()).toMatch(/dataset\.mode/);
  });

  it("cue: mousedown dispara el pulso vía data-cue y se limpia solo", () => {
    expect(tsx()).toMatch(/addEventListener\("mousedown"/);
    expect(tsx()).toMatch(/dataset\.cue/);
    expect(tsx()).toMatch(/animationend/);
  });

  it("solo punteros finos y sin prefers-reduced-motion (igual que antes)", () => {
    expect(tsx()).toContain('matchMedia("(pointer: fine)")');
    expect(tsx()).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(tsx()).toContain('classList.add("has-cursor")');
  });
});

describe("app/globals.css — cursor", () => {
  it("el glifo es fijo, sin eventos, con mix-blend difference y transiciones cortas", () => {
    const block = css().match(/\.cursor \{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("position: fixed");
    expect(block).toContain("pointer-events: none");
    expect(block).toContain("mix-blend-mode: difference");
    expect(block).toMatch(/transition:[^;]*opacity/);
  });

  it("el wrapper posicionado NUNCA usa scale (se aplica antes que transform y multiplica el translate — el salto de #146)", () => {
    const wrapperRules = [...css().matchAll(/\.cursor(\[[^\]]+\])* \{[^}]*\}/g)].map((m) => m[0]);
    expect(wrapperRules.length).toBeGreaterThan(0);
    for (const r of wrapperRules) expect(r, r).not.toMatch(/\bscale:/);
    expect(css()).toMatch(/\.cursor\[data-mode="pause"\] \.cursor-glyph \{[^}]*scale: 1\.5/);
  });

  it("pause crece y muestra las barras; hidden se apaga; play muestra el triángulo", () => {
    expect(css()).toMatch(/\.cursor\[data-mode="pause"\] \.cursor-play \{[^}]*opacity: 0/);
    expect(css()).toMatch(/\.cursor\[data-mode="play"\] \.cursor-pause \{[^}]*opacity: 0/);
    expect(css()).toMatch(/\.cursor\[data-mode="hidden"\] \{[^}]*opacity: 0/);
    // hidden gana a visible: misma especificidad, declarada después
    expect(css().indexOf('.cursor[data-mode="hidden"]')).toBeGreaterThan(css().indexOf('.cursor[data-visible="true"]'));
    expect(tsx()).not.toMatch(/style\.opacity/);
  });

  it("el pulso cue existe y dura menos de 300 ms", () => {
    expect(css()).toMatch(/@keyframes cursor-cue/);
    const m = css().match(/\.cursor\[data-cue="true"\] svg \{[^}]*animation: cursor-cue (\d+)ms/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(300);
  });

  it("cursor: none también sobre <summary>; sin restos de .cursor-dot/.cursor-ring", () => {
    expect(css()).toMatch(/html\.has-cursor summary/);
    expect(css()).not.toMatch(/cursor-dot|cursor-ring/);
  });

  it("prefers-reduced-motion apaga el glifo", () => {
    const reduced = css().slice(css().indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.cursor \{ display: none !important; \}/);
  });
});
