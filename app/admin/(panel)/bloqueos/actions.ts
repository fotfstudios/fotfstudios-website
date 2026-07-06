"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository } from "@/src/composition";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createBlockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("blocks.manage");
    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    // El admin es de confianza, pero un request forjado no debe fabricar timestamps basura:
    // NaN/negativos → `rangeFor` produce fechas inválidas → filas corruptas. Rechazar aquí.
    const date = str(fd, "date");
    const startMinute = num(fd, "startMinute");
    const durationHours = num(fd, "durationHours");
    if (!DATE_RE.test(date) || !DateTime.fromISO(date, { zone: resource.timezone }).isValid) {
      throw new Error("Fecha inválida.");
    }
    if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
      throw new Error("Hora de inicio inválida.");
    }
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24) {
      throw new Error("Duración inválida: entre 1 y 24 horas.");
    }

    const { startsAt, endsAt } = rangeFor(date, startMinute, durationHours, resource.timezone);
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
