import { type AdminClaims, hasPermission, isAdminMember, type Permission } from "@/src/domain/auth/permissions";
import { createAuthServerClient } from "./server";

/** Lee los claims RBAC (app_role/app_permissions) del JWT validado de la sesión. */
export async function currentClaims(): Promise<AdminClaims | null> {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as AdminClaims | undefined) ?? null;
}

/** Re-verifica que sea admin en cada server action/página sensible. */
export async function requireAdmin(): Promise<void> {
  if (!isAdminMember(await currentClaims())) throw new Error("no autorizado");
}

/** Exige un permiso concreto; `super_admin` pasa todo. Lanza si falta. */
export async function requirePermission(permission: Permission): Promise<void> {
  if (!hasPermission(await currentClaims(), permission)) throw new Error("no autorizado");
}
