import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL } from "./email-tokens";

/**
 * Los hex del email son los mismos tokens de marca que app/globals.css. Antes vivían
 * copiados en templates.ts y ya habían divergido en uso (bone-mute prohibido en la
 * app, usado en correos). Este test los ata: cambiar un color en globals.css sin
 * cambiarlo acá falla.
 */
describe("EMAIL tokens = globals.css", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const cssVar = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

  it.each([
    ["ink", "ink"],
    ["inkSoft", "ink-soft"],
    ["inkLine", "ink-line"],
    ["bone", "bone"],
    ["boneDim", "bone-dim"],
    ["boneQuiet", "bone-quiet"],
    ["gold", "gold"],
    ["sirena", "sirena"],
  ] as const)("EMAIL.%s === --color-%s", (key, name) => {
    expect(EMAIL[key].toLowerCase()).toBe(cssVar(name));
  });

  it("no exporta bone-mute: 3.78:1 no alcanza AA en texto de correo", () => {
    expect((EMAIL as Record<string, string>).boneMute).toBeUndefined();
    expect(Object.values(EMAIL).map((v) => v.toLowerCase())).not.toContain("#6f6c64");
  });

  it("templates.ts no tiene hex sueltos: todo color pasa por EMAIL.*", () => {
    const src = readFileSync(join(process.cwd(), "src/application/notifications/templates.ts"), "utf8");
    const loose = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(loose).toEqual([]);
  });
});
