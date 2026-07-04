import { describe, expect, it } from "vitest";
import { validateProfile } from "./profile";

describe("validateProfile", () => {
  it("normaliza: recorta espacios y convierte vacíos a null", () => {
    expect(validateProfile({ name: "  Ana Silva ", phone: "" })).toEqual({ name: "Ana Silva", phone: null });
    expect(validateProfile({ name: "", phone: " +56 9 6280 3298 " })).toEqual({
      name: null,
      phone: "+56 9 6280 3298",
    });
  });

  it("rechaza nombre demasiado largo", () => {
    expect(() => validateProfile({ name: "x".repeat(81), phone: "" })).toThrow(/nombre/i);
    expect(validateProfile({ name: "x".repeat(80), phone: "" }).name).toHaveLength(80);
  });

  it("rechaza teléfonos con formato inválido", () => {
    expect(() => validateProfile({ name: "", phone: "no-es-fono" })).toThrow(/teléfono/i);
    expect(() => validateProfile({ name: "", phone: "123" })).toThrow(/teléfono/i);
    expect(() => validateProfile({ name: "", phone: "1".repeat(21) })).toThrow(/teléfono/i);
  });

  it("acepta formatos chilenos habituales", () => {
    expect(validateProfile({ name: "", phone: "+56962803298" }).phone).toBe("+56962803298");
    expect(validateProfile({ name: "", phone: "(9) 6280-3298" }).phone).toBe("(9) 6280-3298");
  });
});
