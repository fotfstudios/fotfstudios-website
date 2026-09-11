import { describe, expect, it } from "vitest";
import { CLIENTES_PER_PAGE, clientesHref, clientesOrdenSpec, parseClientesSearchParams } from "./clientes-list";

describe("parseClientesSearchParams", () => {
  it("defaults: sin q, orden recientes, página 1", () => {
    expect(parseClientesSearchParams({})).toEqual({ q: "", orden: "recientes", page: 1, perPage: CLIENTES_PER_PAGE });
  });

  it("acepta valores válidos", () => {
    expect(parseClientesSearchParams({ q: "mat", orden: "nombre", p: "3" })).toMatchObject({ q: "mat", orden: "nombre", page: 3 });
  });

  it("orden desconocido → recientes", () => {
    expect(parseClientesSearchParams({ orden: "zzz" }).orden).toBe("recientes");
  });

  it.each(["0", "-1", "abc", ""])("página inválida (%s) → 1", (p) => {
    expect(parseClientesSearchParams({ p }).page).toBe(1);
  });

  it("clampa la página a 10.000 (PostgREST serializa mal los offsets enormes)", () => {
    expect(parseClientesSearchParams({ p: "10001" }).page).toBe(10_000);
  });

  it("q: recorta espacios, toma el primero si viene como array, y capa a 80", () => {
    expect(parseClientesSearchParams({ q: "  ana  " }).q).toBe("ana");
    expect(parseClientesSearchParams({ q: ["ana", "otro"] }).q).toBe("ana");
    expect(parseClientesSearchParams({ q: "x".repeat(100) }).q).toHaveLength(80);
  });
});

describe("clientesOrdenSpec", () => {
  it("recientes = created_at desc; nombre = name_norm asc (sin acentos); puntos = saldo desc", () => {
    expect(clientesOrdenSpec("recientes")).toEqual({ column: "created_at", ascending: false });
    expect(clientesOrdenSpec("nombre")).toEqual({ column: "name_norm", ascending: true });
    expect(clientesOrdenSpec("puntos")).toEqual({ column: "points_balance", ascending: false });
  });
});

describe("clientesHref", () => {
  const base = parseClientesSearchParams({});

  it("sin cambios ni defaults → la ruta pelada", () => {
    expect(clientesHref(base)).toBe("/admin/clientes");
  });

  it("omite cada default y serializa el resto", () => {
    expect(clientesHref(base, { q: "mat", orden: "nombre", page: 2 })).toBe("/admin/clientes?q=mat&orden=nombre&p=2");
  });

  it("cambiar un filtro resetea la página", () => {
    expect(clientesHref({ ...base, page: 4 }, { q: "ana" })).toBe("/admin/clientes?q=ana");
  });

  it("pero un cambio de página explícito gana", () => {
    expect(clientesHref({ ...base, q: "ana" }, { page: 3 })).toBe("/admin/clientes?q=ana&p=3");
  });
});
