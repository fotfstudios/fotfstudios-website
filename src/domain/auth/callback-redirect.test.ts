import { describe, expect, it } from "vitest";
import { failureLoginPath, resolveDestination, safeNext } from "./callback-redirect";

describe("safeNext", () => {
  it("acepta rutas internas de la allow-list (exactas y anidadas)", () => {
    expect(safeNext("/cuenta")).toBe("/cuenta");
    expect(safeNext("/cuenta/reservas")).toBe("/cuenta/reservas");
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/reservar")).toBe("/reservar");
  });

  it("rechaza destinos externos y open-redirects", () => {
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });

  it("rechaza rutas internas fuera de la allow-list", () => {
    expect(safeNext("/evil")).toBeNull();
    expect(safeNext("/cuentahack")).toBeNull();
    expect(safeNext("/adminx")).toBeNull();
  });

  it("valida el path ignorando query y fragment (no se cuelan por ahí)", () => {
    expect(safeNext("/cuenta?tab=puntos")).toBe("/cuenta?tab=puntos");
    expect(safeNext("/evil?x=/cuenta")).toBeNull();
    expect(safeNext("/evil#/cuenta")).toBeNull();
  });

  it("null/vacío → null", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});

describe("resolveDestination", () => {
  it("respeta next permitido según rol", () => {
    expect(resolveDestination("/cuenta/reservas", false)).toBe("/cuenta/reservas");
    expect(resolveDestination("/admin", true)).toBe("/admin");
    expect(resolveDestination("/reservar", false)).toBe("/reservar");
  });

  it("no-admin pidiendo /admin cae a /cuenta (sin loop de login)", () => {
    expect(resolveDestination("/admin", false)).toBe("/cuenta");
    expect(resolveDestination("/admin/reservas", false)).toBe("/cuenta");
  });

  it("sin next (o inválido): default por rol", () => {
    expect(resolveDestination(null, true)).toBe("/admin");
    expect(resolveDestination(null, false)).toBe("/cuenta");
    expect(resolveDestination("https://evil.com", false)).toBe("/cuenta");
    expect(resolveDestination("//evil.com", true)).toBe("/admin");
  });
});

describe("failureLoginPath", () => {
  it("flujos de cliente vuelven al login de cliente", () => {
    expect(failureLoginPath("/cuenta")).toBe("/cuenta/login");
    expect(failureLoginPath("/cuenta/reservas")).toBe("/cuenta/login");
    expect(failureLoginPath("/reservar")).toBe("/cuenta/login");
  });

  it("sin next o next admin/inválido: login admin (comportamiento actual)", () => {
    expect(failureLoginPath(null)).toBe("/admin/login");
    expect(failureLoginPath("/admin")).toBe("/admin/login");
    expect(failureLoginPath("https://evil.com")).toBe("/admin/login");
  });
});
