"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { customerDirectory } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Edición de la ficha. NO duplica reglas: `update_customer_contact` ya rechaza
 * cambiarle el email a un titular de cuenta, dejar sin email a quien tiene
 * puntos o historial con él, y un email sin forma. Acá solo se traduce.
 *
 * Revalida también las reservas: el snapshot de contacto de cada una se
 * reescribe desde la ficha (es la propagación que /cuenta/perfil también hace).
 */
export async function updateCustomerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("customers.manage");
    const id = str(fd, "id");
    const r = await customerDirectory().update(id, { name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") });
    if (!r.ok) throw new Error(r.error);
    revalidatePath(`/admin/clientes/${id}`);
    revalidatePath("/admin/clientes");
    revalidatePath("/admin/reservas");
  });
}
