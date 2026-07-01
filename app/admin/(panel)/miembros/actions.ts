"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function inviteMemberAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("members.manage");
    const email = str(fd, "email").toLowerCase();
    const roleId = str(fd, "roleId");
    if (!email || !roleId) throw new Error("Indica correo y rol.");
    await memberService().invite(email, roleId, null);
    revalidatePath("/admin/miembros");
  });
}

export async function setMemberRoleAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("members.manage");
    await memberService().setMemberRole(str(fd, "memberId"), str(fd, "roleId"));
    revalidatePath("/admin/miembros");
  });
}

export async function setMemberStatusAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("members.manage");
    const status = str(fd, "status") === "disabled" ? "disabled" : "active";
    await memberService().setMemberStatus(str(fd, "memberId"), status);
    revalidatePath("/admin/miembros");
  });
}
