import { describe, expect, it } from "vitest";
import { formatArticleDate } from "./format";

describe("formatArticleDate", () => {
  /**
   * La trampa: `new Date("2026-09-23")` es medianoche UTC, y formatear eso en
   * America/Santiago (UTC−3/−4) devuelve el 22. La fecha de publicación es un día del
   * calendario, no un instante, así que se formatea en UTC.
   */
  it("no se corre un día hacia atrás por la zona horaria de Chile", () => {
    expect(formatArticleDate("2026-09-23")).toContain("23");
    expect(formatArticleDate("2026-01-01")).toContain("1 de enero");
    expect(formatArticleDate("2026-01-01")).toContain("2026");
  });

  it("escribe el mes en español", () => {
    expect(formatArticleDate("2026-09-23")).toBe("23 de septiembre de 2026");
  });
});
