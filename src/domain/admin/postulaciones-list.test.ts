import { describe, expect, it } from "vitest";
import {
  POSTULACIONES_PER_PAGE,
  TAB_TO_STATUS,
  parsePostulacionesSearchParams,
  postulacionesHref,
} from "./postulaciones-list";

describe("parsePostulacionesSearchParams", () => {
  it("sin params → default (nuevas / página 1) — la bandeja de triage", () => {
    expect(parsePostulacionesSearchParams({})).toEqual({
      estado: "nuevas",
      page: 1,
      perPage: POSTULACIONES_PER_PAGE,
    });
  });

  it("tab válido pasa tal cual", () => {
    expect(parsePostulacionesSearchParams({ estado: "descartadas", p: "2" })).toMatchObject({
      estado: "descartadas",
      page: 2,
    });
  });

  it("tab desconocido cae a nuevas", () => {
    expect(parsePostulacionesSearchParams({ estado: "zzz" }).estado).toBe("nuevas");
  });

  it("página: clamp de NaN, cero, negativos, decimales y tope", () => {
    expect(parsePostulacionesSearchParams({ p: "0" }).page).toBe(1);
    expect(parsePostulacionesSearchParams({ p: "-3" }).page).toBe(1);
    expect(parsePostulacionesSearchParams({ p: "abc" }).page).toBe(1);
    expect(parsePostulacionesSearchParams({ p: "4.8" }).page).toBe(4);
    expect(parsePostulacionesSearchParams({ p: "99999999999999999999" }).page).toBe(10_000);
  });
});

describe("TAB_TO_STATUS", () => {
  it("mapea cada tab a su estado (todas → null)", () => {
    expect(TAB_TO_STATUS.nuevas).toBe("nueva");
    expect(TAB_TO_STATUS.contactadas).toBe("contactada");
    expect(TAB_TO_STATUS.descartadas).toBe("descartada");
    expect(TAB_TO_STATUS.todas).toBeNull();
  });
});

describe("postulacionesHref", () => {
  const base = { estado: "nuevas" as const, page: 3, perPage: POSTULACIONES_PER_PAGE };

  it("omite los valores por defecto", () => {
    expect(postulacionesHref({ ...base, page: 1 })).toBe("/admin/postulaciones");
  });

  it("cambiar de tab resetea la página", () => {
    expect(postulacionesHref(base, { estado: "todas" })).toBe("/admin/postulaciones?estado=todas");
  });

  it("una página explícita se conserva (tab default omitido)", () => {
    expect(postulacionesHref(base, { page: 2 })).toBe("/admin/postulaciones?p=2");
  });

  it("en un tab no-default, la página conserva el estado", () => {
    const onTab = { estado: "contactadas" as const, page: 1, perPage: POSTULACIONES_PER_PAGE };
    expect(postulacionesHref(onTab, { page: 2 })).toBe("/admin/postulaciones?estado=contactadas&p=2");
  });
});
