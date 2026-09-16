import { describe, expect, it } from "vitest";
import { GUIDE_LEAD_CAPS, GUIDE_LEAD_SOURCES, parseGuideLead } from "./lead";

const valid = () => ({ email: "DJ@Correo.CL", source: "hero", website: "" });

function issuesOf(raw: unknown): { field: string; code: string }[] {
  const r = parseGuideLead(raw);
  return r.kind === "invalid" ? r.issues : [];
}

describe("parseGuideLead — camino feliz y normalización", () => {
  it("un cuerpo válido devuelve kind:ok con el email en minúsculas y sin espacios", () => {
    const r = parseGuideLead({ ...valid(), email: "  DJ@Correo.CL " });
    expect(r).toEqual({ kind: "ok", value: { email: "dj@correo.cl", source: "hero" } });
  });

  it("acepta los tres orígenes del formulario", () => {
    expect(GUIDE_LEAD_SOURCES).toEqual(["hero", "fragmento", "cierre"]);
    for (const source of GUIDE_LEAD_SOURCES) {
      expect(parseGuideLead({ ...valid(), source }).kind).toBe("ok");
    }
  });

  it("acepta un email de exactamente 120 caracteres", () => {
    const email = "a".repeat(110) + "@correo.cl";
    expect(email).toHaveLength(GUIDE_LEAD_CAPS.email);
    expect(parseGuideLead({ ...valid(), email }).kind).toBe("ok");
  });
});

describe("parseGuideLead — honeypot", () => {
  it("un website lleno se descarta en silencio como spam, aunque el resto sea válido", () => {
    expect(parseGuideLead({ ...valid(), website: "http://spam.example" })).toEqual({ kind: "spam" });
  });

  it("un website vacío o ausente no es spam", () => {
    expect(parseGuideLead({ email: "dj@correo.cl", source: "hero" }).kind).toBe("ok");
  });
});

describe("parseGuideLead — inválidos (todos los issues juntos)", () => {
  it("email vacío → required", () => {
    expect(issuesOf({ ...valid(), email: "   " })).toEqual([{ field: "email", code: "required" }]);
  });

  it("email sin forma → invalid", () => {
    expect(issuesOf({ ...valid(), email: "dj@correo" })).toEqual([{ field: "email", code: "invalid" }]);
  });

  it("email de 121 caracteres → too_long", () => {
    const email = "a".repeat(111) + "@correo.cl";
    expect(issuesOf({ ...valid(), email })).toEqual([{ field: "email", code: "too_long" }]);
  });

  it("source ausente → required; fuera del catálogo → invalid", () => {
    expect(issuesOf({ ...valid(), source: "" })).toEqual([{ field: "source", code: "required" }]);
    expect(issuesOf({ ...valid(), source: "popup" })).toEqual([{ field: "source", code: "invalid" }]);
  });

  it("acumula email y source inválidos en una sola respuesta", () => {
    expect(issuesOf({ email: "x", source: "popup" })).toEqual([
      { field: "email", code: "invalid" },
      { field: "source", code: "invalid" },
    ]);
  });

  it("un cuerpo que no es objeto (null, array, string) es inválido, no una excepción", () => {
    for (const raw of [null, [], "dj@correo.cl", 42]) {
      expect(parseGuideLead(raw).kind).toBe("invalid");
    }
  });

  it("quita caracteres de control del email antes de validar", () => {
    expect(parseGuideLead({ ...valid(), email: "dj@correo.cl\n" })).toEqual({
      kind: "ok",
      value: { email: "dj@correo.cl", source: "hero" },
    });
  });
});
