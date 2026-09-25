import { describe, expect, it } from "vitest";
import { NEWSLETTER_SOURCE_RE, NEWSLETTER_SOURCES, parseNewsletterSubscribe } from "./subscribe";

describe("parseNewsletterSubscribe", () => {
  it("normaliza el email y arma el input", () => {
    const r = parseNewsletterSubscribe({ email: "  Ana@Example.COM ", source: "curso_dj", utmSource: "ig" });
    expect(r).toEqual({
      kind: "ok",
      value: {
        email: "ana@example.com",
        source: "curso_dj",
        utm: { source: "ig", medium: null, campaign: null, content: null, term: null },
        referrerHost: null,
      },
    });
  });

  it("honeypot lleno = spam, aunque el resto sea inválido", () => {
    expect(parseNewsletterSubscribe({ email: "", source: "", website: "x" })).toEqual({ kind: "spam" });
  });

  it("junta todos los issues", () => {
    const r = parseNewsletterSubscribe({ email: "no-es-correo", source: "otro" });
    expect(r).toEqual({
      kind: "invalid",
      issues: [
        { field: "email", code: "invalid" },
        { field: "source", code: "invalid" },
      ],
    });
  });

  it("vacío o no-objeto → required", () => {
    expect(parseNewsletterSubscribe(null)).toEqual({ kind: "invalid", issues: [{ field: "email", code: "required" }] });
    expect(parseNewsletterSubscribe({ source: "curso_dj" })).toEqual({
      kind: "invalid",
      issues: [{ field: "email", code: "required" }],
    });
  });

  it("email sobre el tope → too_long", () => {
    const r = parseNewsletterSubscribe({ email: `${"a".repeat(115)}@x.com`, source: "curso_dj" });
    expect(r).toEqual({ kind: "invalid", issues: [{ field: "email", code: "too_long" }] });
  });

  it("los UTM se truncan y los caracteres de control se limpian", () => {
    const r = parseNewsletterSubscribe({
      email: "a@b.cl",
      source: "curso_dj",
      utmCampaign: "x".repeat(500),
      referrerHost: "google.com\n",
    });
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.value.utm.campaign).toHaveLength(120);
    expect(r.value.referrerHost).toBe("google.com");
  });

  it("cada source del catálogo respeta el CHECK de la DB", () => {
    for (const s of NEWSLETTER_SOURCES) {
      expect(NEWSLETTER_SOURCE_RE.test(s)).toBe(true);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(24);
    }
  });
});
