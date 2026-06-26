import type {
  AdminInviter,
  AdminMemberView,
  AdminRoleView,
  AdminRoleWithPerms,
  MemberRepository,
  PermissionView,
} from "@/src/application/ports/members";

export interface MemberServiceConfig {
  siteUrl: string;
}

/**
 * Gestión de miembros y roles del admin. La invitación es nativa de Supabase
 * (crea el usuario + correo) y luego registra el miembro con su rol. El anti-lockout
 * (último super_admin) lo garantiza un trigger en la DB: si una operación lo violaría,
 * el repo lanza y la action lo muestra.
 */
export class MemberService {
  constructor(
    private readonly repo: MemberRepository,
    private readonly inviter: AdminInviter,
    private readonly config: MemberServiceConfig,
  ) {}

  listMembers(): Promise<AdminMemberView[]> {
    return this.repo.listMembers();
  }
  listRoles(): Promise<AdminRoleView[]> {
    return this.repo.listRoles();
  }
  listRolesWithPermissions(): Promise<AdminRoleWithPerms[]> {
    return this.repo.listRolesWithPermissions();
  }
  listPermissions(): Promise<PermissionView[]> {
    return this.repo.listPermissions();
  }

  async invite(email: string, roleId: string, invitedBy: string | null): Promise<void> {
    const redirectTo = `${this.config.siteUrl.replace(/\/$/, "")}/auth/callback`;
    const userId = await this.inviter.invite(email, redirectTo);
    await this.repo.upsertMember({ email, roleId, userId, invitedBy });
  }

  setMemberRole(memberId: string, roleId: string): Promise<void> {
    return this.repo.setMemberRole(memberId, roleId);
  }
  setMemberStatus(memberId: string, status: "active" | "disabled"): Promise<void> {
    return this.repo.setMemberStatus(memberId, status);
  }
  createRole(name: string, permissions: string[]): Promise<void> {
    return this.repo.createRole(name, permissions);
  }
  setRolePermissions(roleId: string, permissions: string[]): Promise<void> {
    return this.repo.setRolePermissions(roleId, permissions);
  }
  deleteRole(roleId: string): Promise<void> {
    return this.repo.deleteRole(roleId);
  }
}
