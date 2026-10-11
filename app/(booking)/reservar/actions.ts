"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { validateBookingContact } from "@/lib/booking-contact";
import { accountEnabled } from "@/lib/flags";
import { bookingEnabled, customerService } from "@/src/composition";
import { assertCustomer } from "@/src/infrastructure/auth/require-customer";

/**
 * "Editar → Guardar" de nombre o celular en /reservar (cliente con sesión). Escribe en la
 * FICHA, igual que /cuenta/perfil: la reserva toma nombre y celular de la ficha, así que lo
 * guardado acá es lo que queda en el pedido y adonde llegan los avisos.
 */
export async function updateBookingContactAction(input: { name: string; phone: string }): Promise<ActionResult> {
  return run(async () => {
    if (!bookingEnabled() || !accountEnabled()) throw new Error("No disponible.");
    const session = await assertCustomer();
    const data = validateBookingContact(input);
    await customerService().updateProfileByUser(session.userId, data);
    revalidatePath("/reservar");
  });
}
