"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository } from "@/src/composition";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function createBlockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("blocks.manage");
    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    const { startsAt, endsAt } = rangeFor(str(fd, "date"), num(fd, "startMinute"), num(fd, "durationHours"), resource.timezone);
    try {
      await repo.createBlock(resource.id, startsAt, endsAt);
    } catch (e) {
      throw new Error(e instanceof Error && e.message.includes("overlap") ? "Ese horario choca con otra reserva o bloqueo." : "No se pudo crear el bloqueo.");
    }
    revalidatePath("/admin/bloqueos");
  });
}

export async function deleteBlockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("blocks.manage");
    await adminRepository().deleteBlock(str(fd, "id"));
    revalidatePath("/admin/bloqueos");
  });
}
