"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { transferRepository } from "@/src/composition";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Prende/apaga la transferencia en el checkout público (respaldo si Mercado Pago falla).
 * Bajo `reservations.create`: quien agenda y cobra reservas manuales ya cobra por
 * transferencia; sumar un permiso nuevo pedía otra migración de RBAC.
 */
export async function setTransferEnabledAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.create");
    const on = fd.get("on") === "true";
    const claims = await currentClaims();
    await transferRepository().setEnabled(on, claims?.sub ?? null);
    revalidatePath("/admin/reservas");
    revalidatePath("/reservar");
  });
}
