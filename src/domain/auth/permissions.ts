/**
 * Catálogo de permisos del admin (por acción). Fuente de verdad en código para
 * tipado y labels de UI; **debe coincidir** con la tabla `admin_permissions` de la
 * migración admin_rbac (hay test de paridad). `super_admin` los tiene todos.
 */
export const PERMISSIONS = {
  "reservations.view": "Ver reservas",
  "reservations.create": "Crear reserva manual",
  "reservations.cancel": "Cancelar / reembolsar",
  "reservations.access": "Marcar acceso",
  "reservations.boleta": "Registrar boleta",
  "blocks.manage": "Gestionar bloqueos",
  "members.manage": "Gestionar miembros",
  "roles.manage": "Gestionar roles",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** Claims que el Custom Access Token Hook inyecta en el JWT. */
export interface AdminClaims {
  app_role?: string;
  app_permissions?: string[];
}

/** ¿El portador del token tiene este permiso? `super_admin` pasa todo. */
export function hasPermission(claims: AdminClaims | null | undefined, perm: Permission): boolean {
  if (!claims?.app_role) return false;
  if (claims.app_role === "super_admin") return true;
  return (claims.app_permissions ?? []).includes(perm);
}

/** ¿Es un miembro admin (cualquier rol activo)? */
export function isAdminMember(claims: AdminClaims | null | undefined): boolean {
  return !!claims?.app_role;
}
