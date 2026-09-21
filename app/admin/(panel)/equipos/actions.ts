"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import { equipmentRepository } from "@/src/composition";
import { parseEquipmentInput, parsePositionValue } from "@/src/domain/equipment/equipment";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Alta desde el diálogo de /admin/equipos. El select de posición viaja como "sede:sala"
 * (positionValue) y se abre acá; todo lo demás lo valida el dominio. Devuelve el id para
 * que el cliente navegue a la ficha (no se puede `redirect()` dentro de runData).
 */
export async function createEquipmentAction(fd: FormData): Promise<ActionDataResult<{ id: string }>> {
  return runData(async () => {
    await requirePermission("equipment.manage");
    const pos = parsePositionValue(String(fd.get("position") ?? ""));
    const parsed = parseEquipmentInput({
      ...Object.fromEntries(fd),
      locationId: pos?.locationId ?? "",
      resourceId: pos?.resourceId ?? "",
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const actor = (await currentClaims())?.sub ?? null;
    const id = await equipmentRepository().create(parsed.value, actor);
    revalidatePath("/admin/equipos");
    return { id };
  });
}
