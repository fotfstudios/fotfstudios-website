import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "./json-ld";

describe("jsonLdHtml", () => {
  it("un título con </script> no puede cerrar la etiqueta", () => {
    const html = jsonLdHtml({ headline: "Fin</script><script>alert(1)</script>" });
    expect(html).not.toContain("</script>");
    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c");
  });

  it("escapa también > y &, que son los otros dos que importan en HTML", () => {
    const html = jsonLdHtml({ a: "10 > 5 & 3 < 4" });
    expect(html).not.toMatch(/[<>&]/);
  });

  it("sigue siendo JSON válido y con el MISMO valor", () => {
    const data = { headline: "Más de 10 < 20 & seguimos", tags: ["a > b"] };
    expect(JSON.parse(jsonLdHtml(data))).toEqual(data);
  });

  it("no toca el contenido que no necesita escape", () => {
    expect(jsonLdHtml({ a: "hola" })).toBe('{"a":"hola"}');
  });
});
