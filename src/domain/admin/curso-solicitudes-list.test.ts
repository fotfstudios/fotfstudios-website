import { describe, expect, it } from "vitest";
import { parseSolicitudesSearchParams, solicitudesHref } from "./curso-solicitudes-list";

const q = (over = {}) => ({ estado: "nuevas" as const, page: 1, perPage: 25, ...over });

describe("parseSolicitudesSearchParams", () => {
  it("sin parámetros cae en 'nuevas', página 1", () => {
    expect(parseSolicitudesSearchParams({})).toEqual({ estado: "nuevas", page: 1, perPage: 25 });
  });

  it("un tab desconocido cae al default en vez de romper", () => {
    expect(parseSolicitudesSearchParams({ estado: "cualquiera" }).estado).toBe("nuevas");
  });

  it("acepta los cinco tabs", () => {
    for (const t of ["nuevas", "contactadas", "inscritas", "descartadas", "todas"]) {
      expect(parseSolicitudesSearchParams({ estado: t }).estado).toBe(t);
    }
  });

  // Un offset exponencial ("1e9") PostgREST lo serializa mal; el clamp lo evita.
  it("la página se acota y nunca baja de 1", () => {
    expect(parseSolicitudesSearchParams({ p: "999999999" }).page).toBe(10_000);
    expect(parseSolicitudesSearchParams({ p: "0" }).page).toBe(1);
    expect(parseSolicitudesSearchParams({ p: "-3" }).page).toBe(1);
    expect(parseSolicitudesSearchParams({ p: "abc" }).page).toBe(1);
  });

  it("toma el primer valor si el parámetro viene repetido", () => {
    expect(parseSolicitudesSearchParams({ estado: ["todas", "nuevas"] }).estado).toBe("todas");
  });
});

describe("solicitudesHref", () => {
  it("el default no ensucia la URL", () => {
    expect(solicitudesHref(q())).toBe("/admin/curso/solicitudes");
  });

  it("cambiar de tab vuelve a la página 1", () => {
    expect(solicitudesHref(q({ page: 4 }), { estado: "todas" })).toBe("/admin/curso/solicitudes?estado=todas");
  });

  it("una página explícita en el patch manda sobre el reseteo", () => {
    expect(solicitudesHref(q(), { estado: "todas", page: 3 })).toBe(
      "/admin/curso/solicitudes?estado=todas&p=3",
    );
  });

  it("paginar conserva el tab", () => {
    expect(solicitudesHref(q({ estado: "inscritas" }), { page: 2 })).toBe(
      "/admin/curso/solicitudes?estado=inscritas&p=2",
    );
  });
});
