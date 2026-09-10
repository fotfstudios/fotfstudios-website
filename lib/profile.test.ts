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

  // Cambio de comportamiento de este PR (antes solo corría el allow-list de
  // caracteres 6–20): el rango de dígitos lo decide `normalizePhone`, que topea
  // en los 15 de E.164 y exige al menos 8. Estos casos pasaban el allow-list y
  // ahora se rechazan; sin ellos el endurecimiento no queda fijado por ningún test.
  it.each(["1".repeat(16), "1".repeat(20), "+" + "1".repeat(19)])(
    "rechaza el teléfono de más de 15 dígitos %s (pasa el allow-list, no E.164)",
    (phone) => {
      expect(() => validateProfile({ name: "", phone })).toThrow(/teléfono/i);
    },
  );

  it.each(["((((((", "+1 (2) 3", "------", "+ - ( ) "])(
    "rechaza la basura de puntuación %s (sin 8 dígitos)",
    (phone) => {
      expect(() => validateProfile({ name: "", phone })).toThrow(/teléfono/i);
    },
  );

  it("15 dígitos (el tope E.164) sigue pasando, tal como se tipeó", () => {
    expect(validateProfile({ name: "", phone: "1".repeat(15) }).phone).toBe("1".repeat(15));
  });

  it("acepta formatos chilenos habituales", () => {
    expect(validateProfile({ name: "", phone: "+56962803298" }).phone).toBe("+56962803298");
    expect(validateProfile({ name: "", phone: "(9) 6280-3298" }).phone).toBe("(9) 6280-3298");
  });
});
