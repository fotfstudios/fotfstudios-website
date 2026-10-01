"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { calendarSyncService } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

/** Adelanta todo lo pendiente (también lo que está en backoff) y barre ahora. */
export async function syncNowAction(): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("calendar.manage");
    const r = await calendarSyncService().syncNow();
    if (!r.configured) throw new Error("Google Calendar no está configurado (faltan las variables de entorno).");
    revalidatePath("/admin/calendario");
  });
}

/**
 * Re-encola todo lo vigente con el fingerprint limpio y barre: vuelve a mandar cada evento
 * aunque no haya cambiado (p. ej. tras borrar eventos a mano en Google).
 */
export async function resyncAllAction(): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("calendar.manage");
    const svc = calendarSyncService();
    await svc.resyncAll();
    const r = await svc.syncNow();
    if (!r.configured) throw new Error("Google Calendar no está configurado (faltan las variables de entorno).");
    revalidatePath("/admin/calendario");
  });
}
