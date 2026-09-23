import { describe, expect, it } from "vitest";
import { headlineSize, splitHeadline } from "./headline";

describe("splitHeadline", () => {
  it("corta donde las dos mitades quedan más parejas", () => {
    // 18 y 16 caracteres: más parejo que "Tu primera hora" / "en una cabina de DJ" (15/19).
    expect(splitHeadline("Tu primera hora en una cabina de DJ")).toEqual([
      "Tu primera hora en",
      "una cabina de DJ",
    ]);
  });

  it("nunca pierde ni repite una palabra", () => {
    for (const t of [
      "Cómo elegir audífonos para DJ",
      "¿Cuánto cuesta un curso de DJ?",
      "Equipo",
      "Dos palabras",
    ]) {
      const [a, b] = splitHeadline(t);
      expect(`${a} ${b}`.trim()).toBe(t);
    }
  });

  it("un título de una palabra deja la segunda línea vacía", () => {
    expect(splitHeadline("Equipo")).toEqual(["Equipo", ""]);
  });
});

describe("headlineSize", () => {
  it("achica a medida que el titular se alarga, para que no se salga del lienzo", () => {
    const corto = headlineSize(["Sala lista,", "tú también."]);
    const largo = headlineSize(splitHeadline("Tu primera hora en una cabina de DJ"));
    const muyLargo = headlineSize(["Cómo elegir bien tus primeros", "audífonos para pinchar en vivo"]);
    expect(corto).toBeGreaterThan(largo);
    expect(largo).toBeGreaterThan(muyLargo);
    expect(muyLargo).toBeGreaterThanOrEqual(58);
  });
});
