/**
 * RBAC del admin contra la base local: paridad del catálogo de permisos, el Custom
 * Access Token Hook, el CRUD de roles/miembros y el trigger anti-lockout. Requiere
 * Supabase local (db:reset siembra roles + el super admin benjamin@fotfstudios.cl).
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "@/src/domain/auth/permissions";
import { SupabaseMemberRepository } from "./member-repository";
import { createServiceClient } from "./supabase-client";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";
const SEED_EMAIL = "benjamin@fotfstudios.cl";

const repo = new SupabaseMemberRepository(createServiceClient(URL, KEY));
const pg = new Client({ connectionString: DB_URL });

beforeAll(async () => {
  await pg.connect();
});
afterAll(async () => {
  await pg.end();
});
afterEach(async () => {
  // Limpia solo lo creado por los tests (no toca el seed).
  await pg.query("delete from admin_members where email like 'rbac-test%'");
  await pg.query("delete from admin_roles where key like 'rbac_test%' or name like 'RBAC Test%'");
});

describe("rbac", () => {
  it("el catálogo en código coincide con admin_permissions de la DB", async () => {
    const dbPerms = await repo.listPermissions();
    expect(new Set(dbPerms.map((p) => p.key))).toEqual(new Set(PERMISSION_KEYS));
  });

  it("el hook inyecta app_role=super_admin + todos los permisos para el super admin sembrado", async () => {
    const { rows } = await pg.query<{ out: { claims: { app_role: string; app_permissions: string[] } } }>(
      `select public.custom_access_token_hook(
         jsonb_build_object('user_id', (select user_id from admin_members where email=$1), 'claims', '{}'::jsonb)
       ) as out`,
      [SEED_EMAIL],
    );
    const claims = rows[0].out.claims;
    expect(claims.app_role).toBe("super_admin");
    expect(new Set(claims.app_permissions)).toEqual(new Set(PERMISSION_KEYS));
  });

  it("crear rol con permisos y reflejarlos en listRolesWithPermissions", async () => {
    await repo.createRole("RBAC Test Recepción", ["reservations.view", "reservations.access"]);
    const roles = await repo.listRolesWithPermissions();
    const role = roles.find((r) => r.name === "RBAC Test Recepción");
    expect(role).toBeTruthy();
    expect(new Set(role!.permissions)).toEqual(new Set(["reservations.view", "reservations.access"]));

    await repo.setRolePermissions(role!.id, ["reservations.view"]);
    const after = (await repo.listRolesWithPermissions()).find((r) => r.id === role!.id);
    expect(after!.permissions).toEqual(["reservations.view"]);
  });

  it("upsertMember crea/actualiza la fila y cambia rol/estado", async () => {
    const staff = (await repo.listRoles()).find((r) => r.key === "staff")!;
    await repo.upsertMember({ email: "rbac-test@e.cl", roleId: staff.id, userId: null, invitedBy: null });
    let m = (await repo.listMembers()).find((x) => x.email === "rbac-test@e.cl")!;
    expect(m.roleName).toBe("Staff");
    expect(m.status).toBe("active");

    await repo.setMemberStatus(m.id, "disabled");
    m = (await repo.listMembers()).find((x) => x.email === "rbac-test@e.cl")!;
    expect(m.status).toBe("disabled");
  });

  it("anti-lockout: no se puede degradar ni desactivar al último super admin", async () => {
    const superMember = (await repo.listMembers()).find((x) => x.email === SEED_EMAIL)!;
    const staff = (await repo.listRoles()).find((r) => r.key === "staff")!;
    await expect(repo.setMemberRole(superMember.id, staff.id)).rejects.toThrow();
    await expect(repo.setMemberStatus(superMember.id, "disabled")).rejects.toThrow();
    // sigue activo y super_admin
    const still = (await repo.listMembers()).find((x) => x.email === SEED_EMAIL)!;
    expect(still.roleName).toBe("Super admin");
    expect(still.status).toBe("active");
  });
});
