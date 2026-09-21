import { describe, expect, it } from "vitest";
import { equiposHref, parseEquiposSearchParams } from "./equipos-list";

describe("parseEquiposSearchParams", () => {
  it("defaults: sin búsqueda, todas las categorías, activos (sin dados de baja), página 1", () => {
    expect(parseEquiposSearchParams({})).toEqual({ q: "", categoria: "", estado: "activos", page: 1, perPage: 25 });
  });
  it("lee y valida cada parámetro", () => {
    expect(parseEquiposSearchParams({ q: "  xdj ", cat: "reproductor", estado: "repair", p: "3" })).toEqual({
      q: "xdj",
      categoria: "reproductor",
      estado: "repair",
      page: 3,
      perPage: 25,
    });
    expect(parseEquiposSearchParams({ cat: "teclado", estado: "lost", p: "-2" })).toMatchObject({ categoria: "", estado: "activos", page: 1 });
    expect(parseEquiposSearchParams({ p: "999999999" }).page).toBe(10_000);
    expect(parseEquiposSearchParams({ q: ["a", "b"] }).q).toBe("a");
    expect(parseEquiposSearchParams({ q: "x".repeat(100) }).q).toHaveLength(80);
  });
});

describe("equiposHref", () => {
  const base = parseEquiposSearchParams({ q: "xdj", cat: "reproductor", estado: "repair", p: "3" });
  it("omite defaults y resetea página al cambiar un filtro", () => {
    expect(equiposHref(parseEquiposSearchParams({}))).toBe("/admin/equipos");
    expect(equiposHref(base)).toBe("/admin/equipos?q=xdj&cat=reproductor&estado=repair&p=3");
    expect(equiposHref(base, { categoria: "" })).toBe("/admin/equipos?q=xdj&estado=repair");
    expect(equiposHref(base, { estado: "activos" })).toBe("/admin/equipos?q=xdj&cat=reproductor");
    expect(equiposHref(base, { page: 2 })).toBe("/admin/equipos?q=xdj&cat=reproductor&estado=repair&p=2");
  });
});
