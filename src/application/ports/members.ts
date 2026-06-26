/** Gestión de miembros y roles del admin (RBAC). */

export interface AdminRoleView {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

export interface AdminRoleWithPerms extends AdminRoleView {
  permissions: string[];
}

export interface AdminMemberView {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  status: string;
  createdAt: string;
}

export interface PermissionView {
  key: string;
  label: string;
}

export interface MemberRepository {
  listMembers(): Promise<AdminMemberView[]>;
  listRoles(): Promise<AdminRoleView[]>;
  listRolesWithPermissions(): Promise<AdminRoleWithPerms[]>;
  listPermissions(): Promise<PermissionView[]>;
  /** Crea/actualiza la fila de miembro (status `active`). */
  upsertMember(p: { email: string; roleId: string; userId: string | null; invitedBy: string | null }): Promise<void>;
  setMemberRole(memberId: string, roleId: string): Promise<void>;
  setMemberStatus(memberId: string, status: "active" | "disabled"): Promise<void>;
  createRole(name: string, permissions: string[]): Promise<void>;
  setRolePermissions(roleId: string, permissions: string[]): Promise<void>;
  deleteRole(roleId: string): Promise<void>;
}

/** Invitación nativa de Supabase (crea el usuario de auth + manda el correo). */
export interface AdminInviter {
  /** Devuelve el `user_id` creado (o el existente). */
  invite(email: string, redirectTo: string): Promise<string>;
}
