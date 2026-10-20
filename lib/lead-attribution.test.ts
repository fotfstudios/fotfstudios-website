import { describe, expect, it } from "vitest";
import { readAttribution, rememberAttribution, resolveAttribution } from "./lead-attribution";

const SITE = "www.fotfstudios.cl";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("readAttribution", () => {
  it("levanta UTM y click IDs de la URL", () => {
    expect(
      readAttribution({ search: "?utm_source=meta&utm_medium=paid&fbclid=IwAR1&gclid=Cj0", hostname: SITE }, ""),
    ).toEqual({ utmSource: "meta", utmMedium: "paid", fbclid: "IwAR1", gclid: "Cj0" });
  });

  it("el referente del propio sitio no es un origen", () => {
    expect(readAttribution({ search: "", hostname: SITE }, "https://fotfstudios.cl/")).toEqual({});
    expect(readAttribution({ search: "", hostname: SITE }, "https://www.google.cl/")).toEqual({ referrerHost: "www.google.cl" });
  });
});

describe("rememberAttribution + resolveAttribution", () => {
  it("quien llegó por un anuncio y volvió sin query conserva el origen de la sesión", () => {
    const store = memory();
    rememberAttribution({ utmSource: "meta", utmMedium: "paid", utmCampaign: "c" }, store);
    expect(resolveAttribution({}, store)).toEqual({ utmSource: "meta", utmMedium: "paid", utmCampaign: "c" });
  });

  it("una visita sin campaña no pisa lo recordado", () => {
    const store = memory();
    rememberAttribution({ gclid: "Cj0" }, store);
    rememberAttribution({ referrerHost: "www.google.cl" }, store);
    expect(resolveAttribution({ referrerHost: "www.google.cl" }, store)).toEqual({ gclid: "Cj0" });
  });

  it("la URL actual con campaña gana sobre lo recordado", () => {
    const store = memory();
    rememberAttribution({ gclid: "viejo" }, store);
    expect(resolveAttribution({ utmSource: "meta", utmMedium: "paid" }, store)).toEqual({ utmSource: "meta", utmMedium: "paid" });
  });

  it("sin storage o con JSON roto, usa la URL actual", () => {
    expect(resolveAttribution({ referrerHost: "x.cl" }, null)).toEqual({ referrerHost: "x.cl" });
    expect(resolveAttribution({}, { getItem: () => "{roto" })).toEqual({});
    expect(() => rememberAttribution({ gclid: "x" }, { setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });
});
