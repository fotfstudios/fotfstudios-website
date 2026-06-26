"use server";

import { revalidatePath } from "next/cache";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const perms = (fd: FormData) => fd.getAll("permissions").map(String);

export async function createRoleAction(fd: FormData) {
  await requirePermission("roles.manage");
  const name = str(fd, "name");
  if (name) await memberService().createRole(name, perms(fd));
  revalidatePath("/admin/roles");
}

export async function setRolePermissionsAction(fd: FormData) {
  await requirePermission("roles.manage");
  await memberService().setRolePermissions(str(fd, "roleId"), perms(fd));
  revalidatePath("/admin/roles");
}

export async function deleteRoleAction(fd: FormData) {
  await requirePermission("roles.manage");
  await memberService().deleteRole(str(fd, "roleId"));
  revalidatePath("/admin/roles");
}
