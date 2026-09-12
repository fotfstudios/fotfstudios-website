"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Las dos marcas del ciclo del PIN viven acá, con la página de la cerradura, y la
 * ficha de reserva las importa: son las mismas dos transiciones desde los dos
 * lugares donde el dueño las hace. Revalidan las tres vistas que las muestran.
 */
const refresh = (reservationId: string) => {
  revalidatePath(`/admin/reservas/${reservationId}`);
  revalidatePath("/admin/cerradura");
  revalidatePath("/admin");
};

/**
 * El dueño confirma que el PIN está en la cerradura. Es la ÚNICA señal de que el
 * código es real: la app no habla con Yale. Desde acá el cron puede mandarlo.
 */
export async function markAccessLoadedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    await adminRepository().markAccessLoaded(reservationId);
    refresh(reservationId);
  });
}

/** El dueño confirma que borró el PIN de la cerradura: cierra el ciclo. */
export async function markAccessRemovedAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    await adminRepository().markAccessRemoved(reservationId);
    refresh(reservationId);
  });
}
