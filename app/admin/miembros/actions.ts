"use server";

import { revalidatePath } from "next/cache";
import { memberService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function inviteMemberAction(fd: FormData) {
  await requirePermission("members.manage");
  const email = str(fd, "email").toLowerCase();
  const roleId = str(fd, "roleId");
  if (email && roleId) await memberService().invite(email, roleId, null);
  revalidatePath("/admin/miembros");
}

export async function setMemberRoleAction(fd: FormData) {
  await requirePermission("members.manage");
  await memberService().setMemberRole(str(fd, "memberId"), str(fd, "roleId"));
  revalidatePath("/admin/miembros");
}

export async function setMemberStatusAction(fd: FormData) {
  await requirePermission("members.manage");
  const status = str(fd, "status") === "disabled" ? "disabled" : "active";
  await memberService().setMemberStatus(str(fd, "memberId"), status);
  revalidatePath("/admin/miembros");
}
