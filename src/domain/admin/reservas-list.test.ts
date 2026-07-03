import { describe, expect, it } from "vitest";
import {
  RESERVAS_PER_PAGE,
  escapeIlike,
  ordenSpec,
  parseReservasSearchParams,
  reservasHref,
} from "./reservas-list";

describe("parseReservasSearchParams", () => {
  it("sin params → defaults (todas / '' / proximas / fecha / página 1)", () => {
    expect(parseReservasSearchParams({})).toEqual({
      estado: "todas",
      q: "",
      tiempo: "proximas",
      orden: "fecha",
      page: 1,
      perPage: RESERVAS_PER_PAGE,
    });
  });

  it("valores válidos pasan tal cual", () => {
    const q = parseReservasSearchParams({ estado: "canceladas", q: "valentina", t: "pasadas", orden: "monto", p: "3" });
    expect(q).toMatchObject({ estado: "canceladas", q: "valentina", tiempo: "pasadas", orden: "monto", page: 3 });
  });

  it("valores desconocidos caen al default", () => {
    const q = parseReservasSearchParams({ estado: "zzz", t: "ayer", orden: "color" });
    expect(q).toMatchObject({ estado: "todas", tiempo: "proximas", orden: "fecha" });
  });

  it("página: clamp de NaN, cero, negativos y decimales", () => {
    expect(parseReservasSearchParams({ p: "0" }).page).toBe(1);
    expect(parseReservasSearchParams({ p: "-2" }).page).toBe(1);
    expect(parseReservasSearchParams({ p: "abc" }).page).toBe(1);
    expect(parseReservasSearchParams({ p: "3.7" }).page).toBe(3);
  });

  it("q: recorta espacios, toma el primero si es array y limita a 80 chars", () => {
    expect(parseReservasSearchParams({ q: "  pedro  " }).q).toBe("pedro");
    expect(parseReservasSearchParams({ q: ["ana", "otro"] }).q).toBe("ana");
    expect(parseReservasSearchParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});

describe("ordenSpec", () => {
  it("fecha deriva la dirección del tiempo", () => {
    expect(ordenSpec({ orden: "fecha", tiempo: "proximas" })).toEqual({ column: "starts_at", ascending: true });
    expect(ordenSpec({ orden: "fecha", tiempo: "pasadas" })).toEqual({ column: "starts_at", ascending: false });
    expect(ordenSpec({ orden: "fecha", tiempo: "todas" })).toEqual({ column: "starts_at", ascending: false });
  });

  it("monto y creacion son descendentes fijos", () => {
    expect(ordenSpec({ orden: "monto", tiempo: "proximas" })).toEqual({
      column: "orders(amount_clp)",
      ascending: false,
    });
    expect(ordenSpec({ orden: "creacion", tiempo: "pasadas" })).toEqual({ column: "created_at", ascending: false });
  });
});

describe("escapeIlike", () => {
  it("escapa comodines de ILIKE", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("john_doe")).toBe("john\\_doe");
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("reemplaza los delimitadores de PostgREST por espacio", () => {
    expect(escapeIlike('a,b(c)"d')).toBe("a b c  d");
  });

  it("aguja hostil combinada no rompe y conserva lo útil", () => {
    expect(escapeIlike('100% Ño,ño (test)')).toBe("100\\% Ño ño  test");
  });

  it("conserva acentos, @, . y +", () => {
    expect(escapeIlike("maría+j@correo.cl")).toBe("maría+j@correo.cl");
  });
});

describe("reservasHref", () => {
  const base = parseReservasSearchParams({});

  it("defaults → URL limpia sin query string", () => {
    expect(reservasHref(base)).toBe("/admin/reservas");
  });

  it("omite defaults y serializa solo lo que difiere", () => {
    expect(reservasHref(base, { estado: "espera" })).toBe("/admin/reservas?estado=espera");
    expect(reservasHref(base, { tiempo: "pasadas" })).toBe("/admin/reservas?t=pasadas");
    expect(reservasHref(base, { orden: "monto" })).toBe("/admin/reservas?orden=monto");
  });

  it("cambiar un filtro resetea la página", () => {
    const enPagina3 = { ...base, page: 3, estado: "confirmadas" as const };
    expect(reservasHref(enPagina3, { estado: "espera" })).toBe("/admin/reservas?estado=espera");
    expect(reservasHref(enPagina3, { q: "ana" })).toBe("/admin/reservas?estado=confirmadas&q=ana");
  });

  it("paginar conserva los filtros activos", () => {
    const filtrada = parseReservasSearchParams({ estado: "confirmadas", q: "ana", t: "pasadas" });
    expect(reservasHref(filtrada, { page: 2 })).toBe("/admin/reservas?estado=confirmadas&q=ana&t=pasadas&p=2");
  });

  it("codifica la búsqueda para URL", () => {
    expect(reservasHref(base, { q: "maría j" })).toBe("/admin/reservas?q=mar%C3%ADa+j");
  });
});
