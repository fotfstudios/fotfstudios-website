/**
 * Contrato de copy del curso 1:1: lo que ve el alumno no habla de "generación" ni
 * de "cupos" (eso era la cohorte grupal). Escanea el texto de las páginas sin sus
 * comentarios, así un docstring que explique la historia no rompe el contrato.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGINAS_DEL_ALUMNO = [
  "app/cuenta/(panel)/curso/page.tsx",
  "app/(marketing)/curso-dj/pago/page.tsx",
];

describe("copy del curso 1:1 — sin vocabulario de cohorte", () => {
  it.each(PAGINAS_DEL_ALUMNO)("%s no dice 'generación' ni 'cupo'", (f) => {
    expect(read(f)).not.toMatch(/generaci[oó]n|cupo/i);
  });

  it("la tarjeta del alumno no se titula con el código y el nombre del programa", () => {
    // El `name` de un programa es el nombre del propio alumno: "P0001 · Martín" no le dice nada.
    expect(read("app/cuenta/(panel)/curso/page.tsx")).not.toMatch(/generationCode\} · \$\{curso\.generationName/);
  });
});
