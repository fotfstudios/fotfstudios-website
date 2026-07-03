"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository, checkoutService, notificationService, refundService } from "@/src/composition";
import { resolveRefundAmount, type RefundMode } from "@/src/domain/scheduling/cancellation-policy";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

const REFUND_MODES: readonly RefundMode[] = ["policy", "full", "none", "custom"];

export async function cancelBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.cancel");
    const id = str(fd, "reservationId");
    const mode = str(fd, "mode") as RefundMode;
    if (!REFUND_MODES.includes(mode)) throw new Error("Modo de cancelación inválido.");

    // El monto se resuelve SIEMPRE del lado del servidor: `policy`/`full` se
    // recalculan al confirmar (starts_at + boleta viva actuales); solo `custom`
    // trae un número del cliente, validado en el dominio y re-capado en el RPC.
    const target = await adminRepository().orderForReservation(id);
    let refundAmount: number | null = null;
    if (mode !== "none") {
      if (!target) throw new Error("Esta reserva no tiene un pago asociado. Cancela sin reembolso.");
      refundAmount = resolveRefundAmount(mode, {
        startsAt: target.startsAt,
        liveBoleta: target.amountClp - target.refundedAmountClp,
        customAmount: mode === "custom" ? num(fd, "customAmount") : undefined,
      });
    }

    const { alreadyProcessed } = await refundService().cancelBooking(id, { refundAmount });

    // Aviso al cliente (best-effort): solo si había un pedido PAGADO antes de
    // cancelar. Si el loopback del webhook ya lo asentó, ese camino ya avisó.
    if (target?.status === "paid" && !alreadyProcessed) {
      await notificationService()
        .notifyCancellation(target.orderId, { refundAmount })
        .catch((e) => console.error("[cancel:email]", e));
    }

    revalidatePath(`/admin/reservas/${id}`);
    revalidatePath("/admin/reservas");
  });
}

export async function recordBoletaAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.boleta");
    const docId = str(fd, "docId");
    const folio = str(fd, "folio");
    const reservationId = str(fd, "reservationId");
    if (folio) await adminRepository().recordBoleta(docId, folio, null);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

export async function markAccessAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    const code = str(fd, "code");
    if (code) await adminRepository().markAccess(reservationId, code);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

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

export async function createBlockAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("blocks.manage");
    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    const { startsAt, endsAt } = rangeFor(str(fd, "date"), num(fd, "startMinute"), num(fd, "durationHours"), resource.timezone);
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
