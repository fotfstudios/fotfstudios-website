import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL, EMAIL_ASSET_BASE, EMAIL_DS, EMAIL_DS_SOURCE } from "./email-tokens";

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

  it.each(["templates.ts", "ds-email.ts"])("%s no tiene hex sueltos: todo color pasa por EMAIL.* / EMAIL_DS.*", (file) => {
    const src = readFileSync(join(process.cwd(), "src/application/notifications", file), "utf8");
    const loose = src.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(loose).toEqual([]);
  });
});

/**
 * Los correos del flujo de reserva usan el design system de la superficie de reservas:
 * mismos hex que components/ds/ds.css. Si el sistema cambia un color, el correo lo sigue.
 */
describe("EMAIL_DS tokens = components/ds/ds.css", () => {
  const css = readFileSync(join(process.cwd(), "components/ds/ds.css"), "utf8");
  const dsVar = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

  it.each(Object.entries(EMAIL_DS_SOURCE))("EMAIL_DS.%s === --%s", (key, name) => {
    expect(EMAIL_DS[key as keyof typeof EMAIL_DS].toLowerCase()).toBe(dsVar(name));
  });

  it("los assets de correo son https absolutos y existen en public/email", () => {
    expect(EMAIL_ASSET_BASE).toMatch(/^https:\/\/www\.fotfstudios\.cl\/email$/);
    for (const f of ["fotf-mini-cream.png", "fotf-icon-grey.png", "fonts/anton-400.woff2", "fonts/space-grotesk-300-500.woff2", "fonts/space-mono-400.woff2", "fonts/space-mono-700.woff2"]) {
      expect(() => readFileSync(join(process.cwd(), "public/email", f))).not.toThrow();
    }
  });
});
