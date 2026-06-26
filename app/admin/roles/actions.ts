"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const perms = (fd: FormData) => fd.getAll("permissions").map(String);

export async function createRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("roles.manage");
    const name = str(fd, "name");
    if (!name) throw new Error("Ponle un nombre al rol.");
    await memberService().createRole(name, perms(fd));
    revalidatePath("/admin/roles");
  });
}

export async function setRolePermissionsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("roles.manage");
    await memberService().setRolePermissions(str(fd, "roleId"), perms(fd));
    revalidatePath("/admin/roles");
  });
}

export async function deleteRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("roles.manage");
    try {
      await memberService().deleteRole(str(fd, "roleId"));
    } catch {
      throw new Error("No se puede eliminar: hay miembros con este rol.");
    }
    revalidatePath("/admin/roles");
  });
}
