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

  it("el catálogo tiene 8 permisos por acción", () => {
    expect(PERMISSION_KEYS).toHaveLength(8);
  });
});
