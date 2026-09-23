import { describe, expect, it } from "vitest";
import { readUtm } from "./guia-utm";

describe("readUtm", () => {
  it("levanta los cinco utm_* de la query", () => {
    expect(
      readUtm({ search: "?utm_source=instagram&utm_medium=social&utm_campaign=guia&utm_content=a&utm_term=b" }, ""),
    ).toEqual({
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "guia",
      utmContent: "a",
      utmTerm: "b",
    });
  });

  it("una landing sin UTM no inventa ninguno", () => {
    expect(readUtm({ search: "" }, "")).toEqual({});
    expect(readUtm({ search: "?otra=cosa" }, "")).toEqual({});
  });

  it("del referente toma SOLO el host: la URL puede llevar datos en la query", () => {
    expect(readUtm({ search: "" }, "https://www.google.com/search?q=curso+de+dj")).toEqual({
      referrerHost: "www.google.com",
    });
  });

  it("un referente ilegible no rompe nada", () => {
    expect(readUtm({ search: "" }, "no-es-una-url")).toEqual({});
  });

  it("ignora un utm vacío o con solo espacios", () => {
    expect(readUtm({ search: "?utm_source=&utm_medium=%20%20" }, "")).toEqual({});
  });
});
