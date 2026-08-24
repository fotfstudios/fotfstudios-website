import { describe, expect, it } from "vitest";
import { hasPermission, isAdminMember, PERMISSION_KEYS } from "./permissions";

describe("permissions", () => {
  it("super_admin pasa cualquier permiso", () => {
    expect(hasPermission({ app_role: "super_admin" }, "members.manage")).toBe(true);
    expect(hasPermission({ app_role: "super_admin" }, "reservations.cancel")).toBe(true);
  });

  it("rol con permiso explícito: solo lo que tiene", () => {
    const staff = { app_role: "staff", app_permissions: ["reservations.view", "reservations.access"] };
    expect(hasPermission(staff, "reservations.view")).toBe(true);
    expect(hasPermission(staff, "reservations.cancel")).toBe(false);
  });

  it("sin claims (no autenticado/no miembro) no tiene acceso", () => {
    expect(isAdminMember(null)).toBe(false);
    expect(isAdminMember({})).toBe(false);
    expect(hasPermission(null, "reservations.view")).toBe(false);
    expect(hasPermission({ app_role: "staff" }, "reservations.view")).toBe(false);
  });

  it("el catálogo tiene 13 permisos por acción", () => {
    expect(PERMISSION_KEYS).toHaveLength(13);
    expect(PERMISSION_KEYS).toContain("reservations.reschedule");
    expect(PERMISSION_KEYS).toContain("applications.manage");
  });

  // El curso separa gestionar (bandeja, cupos, agenda) de cobrar (link de pago,
  // pago offline, boleta) — mismo corte que reservations.create vs .boleta, para
  // poder delegar la bandeja sin delegar el dinero.
  it("el curso aporta dos permisos y son independientes entre sí", () => {
    expect(PERMISSION_KEYS).toContain("course.manage");
    expect(PERMISSION_KEYS).toContain("course.billing");

    const soloGestion = { app_role: "staff", app_permissions: ["course.manage"] };
    expect(hasPermission(soloGestion, "course.manage")).toBe(true);
    expect(hasPermission(soloGestion, "course.billing")).toBe(false);
  });
});
