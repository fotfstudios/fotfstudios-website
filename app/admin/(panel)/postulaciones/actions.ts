"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { applicationRepository } from "@/src/composition";
import { isApplicationStatus } from "@/src/domain/applications/application";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

/** Cambia el estado de una postulación (nueva → contactada / descartada, reversible). */
export async function setApplicationStatusAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("applications.manage");
    const id = String(fd.get("id") ?? "").trim();
    const status = String(fd.get("status") ?? "").trim();
    if (!id) throw new Error("Falta el id.");
    if (!isApplicationStatus(status)) throw new Error("Estado inválido.");
    await applicationRepository().updateStatus(id, status);
    revalidatePath("/admin/postulaciones");
  });
}
