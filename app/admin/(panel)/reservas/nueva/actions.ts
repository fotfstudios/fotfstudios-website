"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import { validateManualBooking } from "@/lib/manual-booking";
import { adminRepository, checkoutService, notificationService, pricingService } from "@/src/composition";
import { TERMS_VERSION } from "@/lib/site";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { loadDayConsole } from "./day-data";
import type { DayConsoleData, ManualBookingInput, ManualBookingResult } from "./types";

const clean = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, 200) : undefined;
};

/** Errores del checkout → mensaje para el staff (nunca el código crudo). */
const checkoutErrorMessage = (code: string): string => {
  if (code === "slot_taken") return "Ese horario ya está tomado.";
  if (code === "too_soon") return "Ese horario ya pasó. Elige otro.";
  if (code.startsWith("sin tarifa")) return "Ese horario está fuera de la tarifa vigente.";
  return "No se pudo crear la reserva.";
};

export async function createManualBookingAction(
  input: ManualBookingInput,
): Promise<ActionDataResult<ManualBookingResult>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    const v = validateManualBooking(input);
    if (!v.ok) throw new Error(v.error);
    const { date, startMinute, durationHours, method, addonKeys, notes } = v.value;

    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    const customer = {
      name: clean(input.customer?.name),
      email: clean(input.customer?.email),
      phone: clean(input.customer?.phone),
    };

    // Cortesía: reserva sin cobro ni boleta (no pasa por checkout/pago). Sin orden
    // no hay líneas: los add-ons elegidos quedan como dato operativo en las notas.
    // A propósito NO valida pasado/horario de apertura (el cliente avisa, no bloquea).
    if (method === "cortesia") {
      const { startsAt, endsAt } = rangeFor(date, startMinute, durationHours, resource.timezone);
      let addonNames: string[] = [];
      if (addonKeys.length > 0) {
        const catalog = await pricingService().getCatalog(resource.id);
        addonNames = (catalog?.addons ?? []).filter((a) => addonKeys.includes(a.key)).map((a) => a.name);
      }
      const courtesyNotes =
        addonNames.length > 0
          ? [notes, `Incluye: ${addonNames.join(", ")}`].filter(Boolean).join(" · ")
          : notes;
      let reservationId: string;
      try {
        reservationId = await repo.createCourtesyBooking(
          resource.id,
          startsAt,
          endsAt,
          customer,
          courtesyNotes || undefined,
        );
      } catch (e) {
        throw new Error(
          e instanceof Error && e.message === "slot_taken" ? "Ese horario ya está tomado." : "No se pudo crear la reserva.",
        );
      }
      // Best-effort: el email nunca voltea una reserva ya creada.
      await notificationService()
        .notifyCourtesy({ email: customer.email ?? null, name: customer.name ?? null, startsAt, addonNames })
        .catch((e) => console.error("[cortesia:notify]", e));
      revalidatePath("/admin/reservas");
      return { reservationId, orderId: null, amount: null };
    }

    // Pendiente de pago: crea la reserva con hold firme y orden pending_payment; se
    // liquida después desde la ficha (marcar pagado / link MP). Sin confirmar, sin boleta.
    if (method === "pendiente") {
      const attested = input.termsAccepted === true;
      const booking = await checkoutService().createBooking(
        {
          resourceId: resource.id, date, startMinute, durationHours, addonKeys, customer,
          ...(attested ? { termsSource: "staff" as const, termsVersion: TERMS_VERSION } : {}),
        },
        { enforceLeadTime: false, firmHold: true },
      );
      if (!booking.ok) throw new Error(checkoutErrorMessage(booking.error));
      const reservationId = await repo.setNotesForOrder(booking.value.orderId, notes || null).catch(() => null);
      revalidatePath("/admin/reservas");
      return { reservationId, orderId: booking.value.orderId, amount: booking.value.amount };
    }

    // Pago offline (efectivo/transferencia): cobra el total y marca pagado. El admin queda
    // exento de la anticipación mínima (walk-ins), pero el pasado sigue vetado.
    // Consentimiento atestiguado por el staff (no bloquea): registra terms_source='staff' en
    // el pedido. La cortesía no pasa por acá (no crea orden → sin registro; el link de T&C
    // igual viaja en el WhatsApp y el email de confirmación).
    const attested = input.termsAccepted === true;
    const booking = await checkoutService().createBooking(
      {
        resourceId: resource.id,
        date,
        startMinute,
        durationHours,
        addonKeys,
        customer,
        ...(attested ? { termsSource: "staff" as const, termsVersion: TERMS_VERSION } : {}),
      },
      { enforceLeadTime: false },
    );
    if (!booking.ok) throw new Error(checkoutErrorMessage(booking.error));

    try {
      const status = await repo.confirmOffline(booking.value.orderId, method);
      if (status !== "confirmed") throw new Error(`confirm_payment: ${status}`);
    } catch {
      // El hold quedó sin pago: libéralo ya (si esto también falla, expira solo en ≤10 min).
      await repo.cancelUnpaidOrder(booking.value.orderId).catch(() => {});
      throw new Error("No se pudo registrar el pago. La reserva fue liberada; intenta de nuevo.");
    }

    // Notas después de confirmar; no fatal: la reserva ya quedó pagada.
    const reservationId = await repo.setNotesForOrder(booking.value.orderId, notes || null).catch(() => null);
    // Email de confirmación al tiro (como el checkout con puntos); si falla, el cron
    // diario lo barre igual (notified_at sigue null).
    await notificationService()
      .notifyOrder(booking.value.orderId)
      .catch((e) => console.error("[manual-booking:email]", e));
    revalidatePath("/admin/reservas");
    return { reservationId, orderId: booking.value.orderId, amount: booking.value.amount };
  });
}

/** Disponibilidad + ocupación (con nombres) del día, para la consola. Solo admin. */
export async function getDayConsoleAction(date: string): Promise<ActionDataResult<DayConsoleData>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida.");
    const resource = await adminRepository().defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");
    return loadDayConsole(resource.id, resource.timezone, date);
  });
}
