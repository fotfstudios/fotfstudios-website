"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { customerDirectory, notificationService } from "@/src/composition";
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

/**
 * Le manda al cliente un correo con su saldo de Puntos FOTF. Lo dispara el dueño
 * desde la ficha; no hay barrido ni cron detrás.
 *
 * La ficha se RELEE en el servidor a propósito: el número que viaja en el correo
 * no puede venir del formulario (lo manda el navegador) ni de un RSC cacheado que
 * quedó viejo. Las tres guardas cubren casos reales, no defensivos:
 *  - sin ficha → id manipulado;
 *  - sin email → `customers.email` es nullable desde el directorio (fichas de
 *    solo teléfono);
 *  - saldo <= 0 → `points_balance` ADMITE deuda por diseño (no tiene `check >= 0`:
 *    el claw-back de un reembolso puede dejarlo negativo). "Tienes -400 puntos" es
 *    un artefacto contable interno que el cliente no debe ver nunca.
 *
 * Sin `revalidatePath`, a diferencia del resto del segmento: mandar el correo no
 * cambia nada de lo que la página muestra.
 */
export async function sendPointsBalanceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("customers.manage");
    const c = await customerDirectory().get(str(fd, "id"));
    if (!c) throw new Error("No encontramos la ficha.");
    if (!c.email) throw new Error("Este cliente no tiene email.");
    if (c.pointsBalance <= 0) throw new Error("Este cliente no tiene puntos que avisar.");
    await notificationService().notifyPointsBalance({ name: c.name, email: c.email, points: c.pointsBalance });
  });
}
