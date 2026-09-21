"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, type ActionResult, run, runData } from "@/components/admin/ui/action";
import { equipmentRepository } from "@/src/composition";
import { parseEquipmentDetails, parseMoveInput, parsePositionValue } from "@/src/domain/equipment/equipment";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Edición de detalles: sin posición ni estado (eso es Mover). La regla de cantidad vive en el repo. */
export async function updateDetailsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    const parsed = parseEquipmentDetails(Object.fromEntries(fd));
    if (!parsed.ok) throw new Error(parsed.error);
    await equipmentRepository().updateDetails(id, parsed.value);
    revalidatePath(`/admin/equipos/${id}`);
    revalidatePath("/admin/equipos");
  });
}

/**
 * Movimiento. Devuelve a dónde quedó el lote: si fue parcial, `itemId` es el ítem NUEVO y el
 * cliente navega a él (no se puede `redirect()` dentro de runData).
 */
export async function moveEquipmentAction(fd: FormData): Promise<ActionDataResult<{ itemId: string; split: boolean; quantity: number }>> {
  return runData(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    const repo = equipmentRepository();
    const current = await repo.get(id);
    if (!current) throw new Error("Ese equipo ya no existe.");
    const pos = parsePositionValue(str(fd, "position"));
    const parsed = parseMoveInput(
      { ...Object.fromEntries(fd), locationId: pos?.locationId ?? "", resourceId: pos?.resourceId ?? "" },
      { quantity: current.quantity },
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const actor = (await currentClaims())?.sub ?? null;
    const r = await repo.move(id, parsed.value, actor);
    revalidatePath(`/admin/equipos/${id}`);
    if (r.split) revalidatePath(`/admin/equipos/${r.itemId}`);
    revalidatePath("/admin/equipos");
    return { ...r, quantity: parsed.value.quantity };
  });
}

/** Borrado duro (cascade sobre su historial). La navegación a la lista la hace ConfirmForm. */
export async function removeEquipmentAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("equipment.manage");
    const id = str(fd, "id");
    await equipmentRepository().remove(id);
    revalidatePath("/admin/equipos");
  });
}
