import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminMemberView,
  AdminRoleView,
  AdminRoleWithPerms,
  MemberRepository,
  PermissionView,
} from "@/src/application/ports/members";
import type { Database } from "./database.types";

export class SupabaseMemberRepository implements MemberRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listMembers(): Promise<AdminMemberView[]> {
    const { data, error } = await this.db
      .from("admin_members")
      .select("id, email, status, created_at, role_id, admin_roles(name)")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => ({
      id: m.id,
      email: m.email,
      roleId: m.role_id,
      roleName: (m.admin_roles as { name: string } | null)?.name ?? "—",
      status: m.status,
      createdAt: m.created_at,
    }));
  }

  async listRoles(): Promise<AdminRoleView[]> {
    const { data, error } = await this.db
      .from("admin_roles")
      .select("id, key, name, is_system")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, isSystem: r.is_system }));
  }

  async listRolesWithPermissions(): Promise<AdminRoleWithPerms[]> {
    const { data, error } = await this.db
      .from("admin_roles")
      .select("id, key, name, is_system, admin_role_permissions(permission)")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.is_system,
      permissions: ((r.admin_role_permissions as { permission: string }[] | null) ?? []).map((p) => p.permission),
    }));
  }

  async listPermissions(): Promise<PermissionView[]> {
    const { data, error } = await this.db.from("admin_permissions").select("key, label").order("key");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ key: p.key, label: p.label }));
  }

  async upsertMember(p: {
    email: string;
    roleId: string;
    userId: string | null;
    invitedBy: string | null;
  }): Promise<void> {
    const { error } = await this.db.from("admin_members").upsert(
      {
        email: p.email.toLowerCase(),
        role_id: p.roleId,
        user_id: p.userId,
        invited_by: p.invitedBy,
        status: "active",
      },
      { onConflict: "email" },
    );
    if (error) throw new Error(error.message);
  }

  async setMemberRole(memberId: string, roleId: string): Promise<void> {
    const { error } = await this.db.from("admin_members").update({ role_id: roleId }).eq("id", memberId);
    if (error) throw new Error(error.message);
  }

  async setMemberStatus(memberId: string, status: "active" | "disabled"): Promise<void> {
    const { error } = await this.db.from("admin_members").update({ status }).eq("id", memberId);
    if (error) throw new Error(error.message);
  }

  async createRole(name: string, permissions: string[]): Promise<void> {
    const key = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const { data, error } = await this.db
      .from("admin_roles")
      .insert({ key, name, is_system: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await this.setRolePermissions(data.id, permissions);
  }

  async setRolePermissions(roleId: string, permissions: string[]): Promise<void> {
    const { error: del } = await this.db.from("admin_role_permissions").delete().eq("role_id", roleId);
    if (del) throw new Error(del.message);
    if (permissions.length === 0) return;
    const { error } = await this.db
      .from("admin_role_permissions")
      .insert(permissions.map((permission) => ({ role_id: roleId, permission })));
    if (error) throw new Error(error.message);
  }

  async deleteRole(roleId: string): Promise<void> {
    // No borrar roles del sistema; los asignados a miembros fallan por FK (restrict).
    const { error } = await this.db.from("admin_roles").delete().eq("id", roleId).eq("is_system", false);
    if (error) throw new Error(error.message);
  }
}
