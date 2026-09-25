import { describe, expect, it } from "vitest";
import {
  INCLUYE,
  POR_SEPARADO,
  PRECIOS,
  PRECIOS_LISTA,
  PROGRAMA,
  SESIONES,
  descuento,
} from "./curso-content";

describe("curso-content", () => {
  it("el programa cuadra: sesiones × duración = horas de clase, una fila por sesión", () => {
    expect(PROGRAMA.sesiones * PROGRAMA.minutosPorSesion).toBe(PROGRAMA.horasClase * 60);
    expect(SESIONES).toHaveLength(PROGRAMA.sesiones);
  });

  it("INCLUYE se arma desde PROGRAMA", () => {
    expect(INCLUYE[0]).toBe("9 horas de clase 1:1 (6 sesiones de 1,5 h)");
    expect(INCLUYE[1]).toBe("6 horas de práctica libre en la sala");
  });

  it("por separado se deriva de lib/pricing.ts ($312.762 con las tarifas de 2026-09)", () => {
    expect(POR_SEPARADO).toBe(312762);
    expect(descuento(PRECIOS.individual, POR_SEPARADO)).toBe(20);
    expect(descuento(PRECIOS.duo, PRECIOS.individual)).toBe(40);
  });

  it("lanzamiento bajo lista, y el dúo sale más barato por persona", () => {
    expect(PRECIOS_LISTA.individual).toBeGreaterThan(PRECIOS.individual);
    expect(PRECIOS_LISTA.duo).toBeGreaterThan(PRECIOS.duo);
    expect(PRECIOS.duo).toBeLessThan(PRECIOS.individual);
  });
});
