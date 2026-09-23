import { describe, expect, it } from "vitest";
import { GUIDE_LEAD_CAPS, parseGuideLead, type GuideCatalogEntry } from "./lead";

/** El catálogo entra como DATO: el dominio no conoce lib/guides. */
const CAT: GuideCatalogEntry = { slug: "guia-dj", sources: ["hero", "fragmento", "cierre"] };

const valid = () => ({ email: "DJ@Correo.CL", source: "hero", guide: "guia-dj", website: "" });

/** Un lead ok, con los opcionales ya resueltos. */
const okValue = (over: Record<string, unknown> = {}) => ({
  email: "dj@correo.cl",
  source: "hero",
  guide: "guia-dj",
  utm: { source: null, medium: null, campaign: null, content: null, term: null },
  referrerHost: null,
  ...over,
});

function issuesOf(raw: unknown): { field: string; code: string }[] {
  const r = parseGuideLead(raw, CAT);
  return r.kind === "invalid" ? r.issues : [];
}

describe("parseGuideLead — camino feliz y normalización", () => {
  it("un cuerpo válido devuelve kind:ok con el email en minúsculas y sin espacios", () => {
    const r = parseGuideLead({ ...valid(), email: "  DJ@Correo.CL " }, CAT);
    expect(r).toEqual({ kind: "ok", value: okValue() });
  });

  it("acepta los orígenes que declara ESA guía, y ningún otro", () => {
    // El catálogo ya no está en el dominio: cada guía declara sus formularios.
    for (const source of CAT.sources) {
      expect(parseGuideLead({ ...valid(), source }, CAT).kind).toBe("ok");
    }
    const otra = { slug: "guia-mezcla", sources: ["hero", "sidebar"] };
    expect(parseGuideLead({ ...valid(), guide: "guia-mezcla", source: "sidebar" }, otra).kind).toBe("ok");
    // "cierre" es válido en guia-dj pero NO en una guía que no lo declara.
    expect(parseGuideLead({ ...valid(), guide: "guia-mezcla", source: "cierre" }, otra).kind).toBe("invalid");
  });

  it("levanta los UTM y solo el host del referente", () => {
    const r = parseGuideLead(
      { ...valid(), utmSource: "instagram", utmMedium: "social", referrerHost: "www.google.com" },
      CAT,
    );
    expect(r).toEqual({
      kind: "ok",
      value: okValue({
        utm: { source: "instagram", medium: "social", campaign: null, content: null, term: null },
        referrerHost: "www.google.com",
      }),
    });
  });

  it("un UTM gigante se TRUNCA, nunca invalida el lead", () => {
    // Basura de una campaña mal armada no es motivo para no entregarle la guía a alguien.
    const r = parseGuideLead({ ...valid(), utmCampaign: "z".repeat(500) }, CAT);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value.utm.campaign).toHaveLength(GUIDE_LEAD_CAPS.utm);
  });

  it("acepta un email de exactamente 120 caracteres", () => {
    const email = "a".repeat(110) + "@correo.cl";
    expect(email).toHaveLength(GUIDE_LEAD_CAPS.email);
    expect(parseGuideLead({ ...valid(), email }, CAT).kind).toBe("ok");
  });
});

describe("parseGuideLead — honeypot", () => {
  it("un website lleno se descarta en silencio como spam, aunque el resto sea válido", () => {
    expect(parseGuideLead({ ...valid(), website: "http://spam.example" }, CAT)).toEqual({ kind: "spam" });
  });

  it("un website vacío o ausente no es spam", () => {
    expect(parseGuideLead({ email: "dj@correo.cl", source: "hero", guide: "guia-dj" }, CAT).kind).toBe("ok");
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

  it("source ausente → required; no declarado por la guía → invalid", () => {
    expect(issuesOf({ ...valid(), source: "" })).toEqual([{ field: "source", code: "required" }]);
    expect(issuesOf({ ...valid(), source: "popup" })).toEqual([{ field: "source", code: "invalid" }]);
  });

  it("guide ausente → required; distinta de la del catálogo → invalid", () => {
    expect(issuesOf({ ...valid(), guide: "" })).toEqual([{ field: "guide", code: "required" }]);
    expect(issuesOf({ ...valid(), guide: "otra-guia" })).toEqual([{ field: "guide", code: "invalid" }]);
  });

  it("acumula email y source inválidos en una sola respuesta", () => {
    expect(issuesOf({ email: "x", source: "popup", guide: "guia-dj" })).toEqual([
      { field: "email", code: "invalid" },
      { field: "source", code: "invalid" },
    ]);
  });

  it("un cuerpo que no es objeto (null, array, string) es inválido, no una excepción", () => {
    for (const raw of [null, [], "dj@correo.cl", 42]) {
      expect(parseGuideLead(raw, CAT).kind).toBe("invalid");
    }
  });

  it("quita caracteres de control del email antes de validar", () => {
    expect(parseGuideLead({ ...valid(), email: "dj@correo.cl\n" }, CAT)).toEqual({
      kind: "ok",
      value: okValue(),
    });
  });
});
