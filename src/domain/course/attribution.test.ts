import { describe, expect, it } from "vitest";
import { ATTRIBUTION_CAPS, EMPTY_ATTRIBUTION, leadChannel, parseAttribution } from "./attribution";

const a = (over: Partial<typeof EMPTY_ATTRIBUTION>) => ({ ...EMPTY_ATTRIBUTION, ...over });

describe("parseAttribution", () => {
  it("sin nada → todo null", () => {
    expect(parseAttribution({})).toEqual(EMPTY_ATTRIBUTION);
  });

  it("trunca los UTM, nunca los rechaza", () => {
    const r = parseAttribution({ utmContent: "y".repeat(300) });
    expect(r.utmContent).toHaveLength(ATTRIBUTION_CAPS.utm);
  });

  it("un click ID raro o demasiado largo se descarta entero (truncado no sirve)", () => {
    expect(parseAttribution({ gclid: "Cj0KCQjw-abc_DEF.1" }).gclid).toBe("Cj0KCQjw-abc_DEF.1");
    expect(parseAttribution({ gclid: "a b" }).gclid).toBeNull();
    expect(parseAttribution({ fbclid: "x".repeat(ATTRIBUTION_CAPS.clickId + 1) }).fbclid).toBeNull();
  });

  it("ignora lo que no es string y quita caracteres de control", () => {
    expect(parseAttribution({ utmSource: 42, utmMedium: "pa\u0000id" })).toMatchObject({ utmSource: null, utmMedium: "paid" });
  });
});

describe("leadChannel", () => {
  it("gclid/gbraid/wbraid = Google Ads (prueba de clic pagado)", () => {
    expect(leadChannel(a({ gclid: "x" })).channel).toBe("google_ads");
    expect(leadChannel(a({ wbraid: "x" })).channel).toBe("google_ads");
  });

  it("Meta Ads solo con UTM de pago; fbclid solo NO prueba que fue un anuncio", () => {
    expect(leadChannel(a({ utmSource: "meta", utmMedium: "paid", utmCampaign: "c" }))).toEqual({ channel: "meta_ads", detail: "c" });
    expect(leadChannel(a({ utmSource: "Instagram", utmMedium: "cpc" })).channel).toBe("meta_ads");
    expect(leadChannel(a({ fbclid: "x" })).channel).toBe("meta");
    expect(leadChannel(a({ referrerHost: "l.instagram.com" })).channel).toBe("meta");
  });

  it("google/cpc por UTM también es Google Ads", () => {
    expect(leadChannel(a({ utmSource: "google", utmMedium: "cpc" })).channel).toBe("google_ads");
  });

  it("otra campaña con UTM muestra source / medium", () => {
    expect(leadChannel(a({ utmSource: "newsletter", utmMedium: "email" }))).toEqual({ channel: "utm", detail: "newsletter / email" });
  });

  it("sin UTM: Google orgánico, referido o directo según el referente", () => {
    expect(leadChannel(a({ referrerHost: "www.google.cl" })).channel).toBe("google_organico");
    expect(leadChannel(a({ referrerHost: "blog.ejemplo.cl" }))).toEqual({ channel: "referido", detail: "blog.ejemplo.cl" });
    expect(leadChannel(EMPTY_ATTRIBUTION)).toEqual({ channel: "directo", detail: null });
  });
});
