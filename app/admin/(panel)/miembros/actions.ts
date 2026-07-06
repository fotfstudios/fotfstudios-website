"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { db, memberService } from "@/src/composition";
import { hostFromHeaders } from "@/lib/urls";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function inviteMemberAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("members.manage");
    const email = str(fd, "email").toLowerCase();
    const roleId = str(fd, "roleId");
    if (!email || !roleId) throw new Error("Indica correo y rol.");
    // El link de invitación vuelve al MISMO deployment (preview/prod) que lo generó.
    const host = hostFromHeaders(await headers());
    await memberService(db(), host).invite(email, roleId, null);
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
