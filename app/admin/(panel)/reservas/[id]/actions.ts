"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { adminRepository, notificationService, refundService } from "@/src/composition";
import { resolveRefundAmount, type RefundMode } from "@/src/domain/scheduling/cancellation-policy";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

const REFUND_MODES: readonly RefundMode[] = ["policy", "full", "none", "custom"];

// Campos de texto libre que escribe el admin (folio SII, código de acceso): tope de largo y
// sin caracteres de control. Defensa en profundidad — el admin es de confianza y React escapa
// al render, pero acota lo que entra a la DB.
const MAX_FIELD = 64;
const badField = (s: string) => s.length > MAX_FIELD || [...s].some((c) => { const n = c.charCodeAt(0); return n < 32 || n === 127; });

export async function cancelBookingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.cancel");
    const id = str(fd, "reservationId");
    const mode = str(fd, "mode") as RefundMode;
    if (!REFUND_MODES.includes(mode)) throw new Error("Modo de cancelación inválido.");

    // El monto se resuelve SIEMPRE del lado del servidor: `policy`/`full` se
    // recalculan al confirmar (starts_at + boleta viva actuales); solo `custom`
    // trae un número del cliente, validado en el dominio y re-capado en el RPC.
    // Orden 100% puntos (efectivo $0): la base reembolsable son los puntos
    // canjeados — misma política 100/50/0, repuesta como puntos.
    const target = await adminRepository().orderForReservation(id);
    let refundAmount: number | null = null;
    if (mode !== "none") {
      if (!target) throw new Error("Esta reserva no tiene un pago asociado. Cancela sin reembolso.");
      const isPointsOrder = target.amountClp === 0 && target.pointsRedeemedClp > 0;
      refundAmount = resolveRefundAmount(mode, {
        startsAt: target.startsAt,
        liveBoleta: isPointsOrder ? target.pointsRedeemedClp : target.amountClp - target.refundedAmountClp,
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
    if (badField(folio)) throw new Error("Folio inválido.");
    if (folio) await adminRepository().recordBoleta(docId, folio, null);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}

export async function markAccessAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("reservations.access");
    const reservationId = str(fd, "reservationId");
    const code = str(fd, "code");
    if (badField(code)) throw new Error("Código inválido.");
    if (code) await adminRepository().markAccess(reservationId, code);
    revalidatePath(`/admin/reservas/${reservationId}`);
  });
}
