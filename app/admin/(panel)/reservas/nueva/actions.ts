"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository, checkoutService } from "@/src/composition";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function createManualBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.create");
    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    const date = str(fd, "date");
    const startMinute = num(fd, "startMinute");
    const durationHours = num(fd, "durationHours");
    const method = str(fd, "method") || "efectivo";
    const customer = {
      name: str(fd, "name") || undefined,
      email: str(fd, "email") || undefined,
      phone: str(fd, "phone") || undefined,
    };

    // Cortesía: reserva sin cobro ni boleta (no pasa por checkout/pago).
    if (method === "cortesia") {
      const { startsAt, endsAt } = rangeFor(date, startMinute, durationHours, resource.timezone);
      try {
        await repo.createCourtesyBooking(resource.id, startsAt, endsAt, customer);
      } catch (e) {
        throw new Error(
          e instanceof Error && e.message === "slot_taken" ? "Ese horario ya está tomado." : "No se pudo crear la reserva.",
        );
      }
      revalidatePath("/admin/reservas");
      return;
    }

    // Pago offline (efectivo/transferencia): cobra el total y marca pagado. El admin queda
    // exento de la anticipación mínima (walk-ins), pero el pasado sigue vetado.
    const booking = await checkoutService().createBooking(
      { resourceId: resource.id, date, startMinute, durationHours, addonKeys: [], customer },
      { enforceLeadTime: false },
    );
    if (!booking.ok) throw new Error(booking.error === "slot_taken" ? "Ese horario ya está tomado." : booking.error);

    await repo.confirmOffline(booking.value.orderId, method);
    revalidatePath("/admin/reservas");
  });
}
