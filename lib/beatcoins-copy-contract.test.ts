/**
 * Los Puntos FOTF se llaman Beatcoins (decisión del dueño, 2026-10-05). Contrato de copy:
 * ninguna pantalla ni correo vuelve a decir "Puntos FOTF" (fuera de comentarios), y
 * /terminos tiene la sección Beatcoins con la regla del curso. La única mención del nombre
 * viejo permitida es la histórica de /terminos ("antes, «Puntos FOTF»").
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const filesUnder = (dir: string, ext: RegExp): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => ext.test(f) && !/\.(test|itest)\.tsx?$/.test(f))
    .map((f) => join(dir, f));

/** Saca comentarios de línea y de bloque (incluidos los {/* … *\/} de JSX). */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TERMS = "app/(marketing)/terminos/page.tsx";

describe("Beatcoins — copy", () => {
  it('ninguna pantalla ni correo dice "Puntos FOTF"', () => {
    const files = [
      ...filesUnder("app", /\.tsx?$/),
      ...filesUnder("components", /\.tsx?$/),
      ...filesUnder("lib", /\.ts$/),
      "src/application/notifications/templates.ts",
      "src/domain/money/payment-method.ts",
    ].filter((f) => f !== TERMS);
    const offenders = files.filter((f) => /puntos fotf/i.test(stripComments(read(f))));
    expect(offenders).toEqual([]);
  });

  it("/terminos tiene la sección Beatcoins, su equivalencia y la regla del curso", () => {
    const src = read(TERMS);
    expect(src).toContain('<ProseSection title="Beatcoins">');
    expect(src).toContain("1 Beatcoin equivale a $1 CLP");
    expect(src).toMatch(/El Curso de DJ no genera Beatcoins/);
    expect(src).toMatch(/sesión de prueba/);
  });
});

/**
 * Vencimiento (decisión del dueño, 2026-10-10): solo vence lo ganado DESDE el corte, y lo
 * anterior nunca. /terminos tiene que decir la misma fecha que BEATCOINS_EXPIRY_FROM (y que
 * beatcoins_settings en la DB) y mantener la promesa sobre lo ya ganado.
 */
describe("Beatcoins — vencimiento en /terminos", () => {
  it("dice la fecha de corte del dominio, los 12 meses y que lo anterior no vence", async () => {
    const { BEATCOINS_EXPIRY_FROM, BEATCOINS_EXPIRY_MONTHS } = await import("@/src/domain/points/expiry");
    const { DateTime } = await import("luxon");
    const corte = DateTime.fromISO(BEATCOINS_EXPIRY_FROM, { zone: "America/Santiago" }).setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
    const src = stripComments(read(TERMS)).replace(/\{" "\}/g, " ").replace(/\s+/g, " ");
    expect(src).toContain(`ganes desde el <strong className="text-bone">${corte}</strong>`);
    expect(src).toContain(`${BEATCOINS_EXPIRY_MONTHS} meses después de tu última reserva pagada`);
    expect(src).toContain(`ganaste antes del ${corte} no vencen nunca`);
    expect(src).toContain("nunca afectan Beatcoins que ya hayas ganado");
    expect(src).not.toMatch(/no tienen fecha de vencimiento/);
  });
});
