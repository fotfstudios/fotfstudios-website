import { describe, expect, it } from "vitest";
import { FAQ_GUIA, FRAGMENTO, GUIA, PARA_QUIEN_GUIA, TEMAS } from "./guia-content";

/** Invariantes que la maqueta de /guia-dj da por sentadas (grillas de 2 y 4, numeración). */
describe("guia-content", () => {
  it("la guía tiene 8 páginas y el fragmento cita una de ellas", () => {
    expect(GUIA.pages).toBe(8);
    expect(FRAGMENTO.pagina).toBeGreaterThan(0);
    expect(FRAGMENTO.pagina).toBeLessThanOrEqual(GUIA.pages);
  });

  it("diez temas numerados 01…10, cada uno con título y línea", () => {
    expect(TEMAS).toHaveLength(10);
    TEMAS.forEach((t, i) => {
      expect(t.n).toBe(String(i + 1).padStart(2, "0"));
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.line.length).toBeGreaterThan(0);
    });
  });

  it("el fragmento trae cuatro pasos, cada uno con una ilustración distinta y su leyenda", () => {
    expect(FRAGMENTO.pasos).toHaveLength(4);
    expect(new Set(FRAGMENTO.pasos.map((p) => p.ilustracion))).toEqual(new Set(["pitch", "cue", "drift", "wave"]));
    for (const p of FRAGMENTO.pasos) expect(p.caption).toMatch(/^[A-ZÁÉÍÓÚÑ0-9 ,.]+$/);
  });

  it("para quién: cuatro y cuatro; FAQ: cuatro preguntas con respuesta", () => {
    expect(PARA_QUIEN_GUIA.sirve).toHaveLength(4);
    expect(PARA_QUIEN_GUIA.noSirve).toHaveLength(4);
    expect(FAQ_GUIA).toHaveLength(4);
    for (const f of FAQ_GUIA) {
      expect(f.q).toMatch(/\?$/);
      expect(f.a.length).toBeGreaterThan(20);
    }
  });

  it("nunca dice 'insonorizada' (brand: 'aislada acústicamente')", () => {
    const all = JSON.stringify({ GUIA, TEMAS, FRAGMENTO, PARA_QUIEN_GUIA, FAQ_GUIA });
    expect(all).not.toMatch(/insonoriz/i);
  });
});
