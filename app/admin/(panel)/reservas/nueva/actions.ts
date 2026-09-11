"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import { validateManualBooking } from "@/lib/manual-booking";
import { adminRepository, checkoutService, customerDirectory, notificationService, pricingService } from "@/src/composition";
import type { CreateCustomerOutcome } from "@/src/application/customers/customer-directory-service";
import type { CustomerProfile } from "@/src/application/ports/customers";
import { TERMS_VERSION } from "@/lib/site";
import { customerDbErrorMessage } from "@/src/domain/customers/customer-input";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { loadDayConsole } from "./day-data";
import type { DayConsoleData, ManualBookingInput, ManualBookingResult } from "./types";

/**
 * Busca fichas para el picker. Va bajo `reservations.create` y no bajo
 * `customers.manage`: agendar exige elegir un cliente, y el dueño decidió que
 * administrar el directorio es un permiso aparte que el staff no tiene.
 */
export async function searchCustomersAction(q: string): Promise<ActionDataResult<CustomerProfile[]>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    return customerDirectory().search(q);
  });
}

/** Alta rápida desde la consola. `exists` vuelve como dato, no como error. */
export async function createCustomerAction(raw: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}): Promise<ActionDataResult<CreateCustomerOutcome>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    const r = await customerDirectory().create(raw);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  });
}

/** Aviso blando al tipear un teléfono ya conocido. Nunca elige por el staff. */
export async function lookupCustomerPhoneAction(phone: string): Promise<ActionDataResult<CustomerProfile | null>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    return customerDirectory().lookupPhone(phone);
  });
}

/** Errores del checkout → mensaje para el staff (nunca el código crudo). */
const checkoutErrorMessage = (code: string): string => {
  // El motor de descuentos ya devuelve una frase para el staff (es la única
  // validación que necesita el quote del server para decidirse).
  if (code.startsWith("discount:")) return code.slice("discount:".length);
  // Fix round 1 (Finding 3): la frase vive en customer-input.ts (pinneada por su test); se
  // importa en vez de duplicarla para que las dos copias no puedan desalinearse.
  // customer_checkout_needs_email: ficha solo-teléfono en un pedido que cobra (fix round 2).
  if (code === "customer_not_found" || code === "customer_checkout_needs_email")
    return customerDbErrorMessage(null, null, code) ?? "No se pudo crear la reserva.";
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
    const { date, startMinute, durationHours, method, addonKeys, notes, customerId, walkInName, discount } = v.value;

    const repo = adminRepository();
    const resource = await repo.defaultResource();
    if (!resource) throw new Error("No hay sala configurada.");

    // El snapshot sale de la FICHA, nunca de lo que viajó en el request: el
    // cliente manda solo un id. Se re-lee acá para cerrar la carrera entre el
    // picker y el guardado (alguien pudo borrar o editar la ficha en el medio).
    const record = customerId ? await customerDirectory().get(customerId) : null;
    if (customerId && !record) {
      throw new Error(customerDbErrorMessage(null, null, "customer_not_found") ?? "El cliente ya no existe.");
    }
    const customer = record
      ? {
          name: record.name ?? undefined,
          email: record.email ?? undefined,
          phone: record.phone ?? undefined,
        }
      : { name: walkInName || undefined, email: undefined, phone: undefined };
    /** Lo que se devuelve a la consola: el dato GUARDADO, no el tipeado. */
    // Con ficha manda la ficha, aunque su nombre sea null: un `??` dejaba
    // colarse el walk-in tipeado y el panel mostraba un nombre que la reserva
    // NO guardó.
    const savedCustomer = record
      ? { name: record.name, phone: record.phone }
      : { name: walkInName || null, phone: null };

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
          record?.id,
        );
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        if (code === "slot_taken") throw new Error("Ese horario ya está tomado.");
        // La ficha puede desaparecer entre el re-read y el insert; esa carrera
        // merece su propia frase y no el copy genérico.
        if (code === "customer_not_found") {
          throw new Error(customerDbErrorMessage(null, null, code) ?? "El cliente ya no existe.");
        }
        throw new Error("No se pudo crear la reserva.");
      }
      // Best-effort: el email nunca voltea una reserva ya creada.
      // Decidido en PR5 (era la duda que dejó anotada PR3): el aviso va a los datos de la
      // FICHA, los mismos que quedaron en el snapshot de la reserva. Antes se mandaba lo
      // TIPEADO, que podía diferir — un titular de cuenta conserva SU nombre— y dejaba al
      // cliente recibiendo un correo que no coincidía con su reserva. Sin ficha (walk-in
      // solo-nombre) no hay email y `notifyCourtesy` no manda nada.
      await notificationService()
        .notifyCourtesy({ email: record?.email ?? null, name: savedCustomer.name, startsAt, addonNames })
        .catch((e) => console.error("[cortesia:notify]", e));
      revalidatePath("/admin/reservas");
      return { reservationId, orderId: null, amount: null, customer: savedCustomer };
    }

    // Pendiente de pago: crea la reserva con hold firme y orden pending_payment; se
    // liquida después desde la ficha (marcar pagado / link MP). Sin confirmar, sin boleta.
    if (method === "pendiente") {
      const attested = input.termsAccepted === true;
      const booking = await checkoutService().createBooking(
        {
          resourceId: resource.id, date, startMinute, durationHours, addonKeys, customer,
          ...(record ? { customerId: record.id } : {}),
          ...(discount ? { manualDiscount: discount } : {}),
          ...(attested ? { termsSource: "staff" as const, termsVersion: TERMS_VERSION } : {}),
        },
        { enforceLeadTime: false, firmHold: true },
      );
      if (!booking.ok) throw new Error(checkoutErrorMessage(booking.error));
      const reservationId = await repo.setNotesForOrder(booking.value.orderId, notes || null).catch(() => null);
      revalidatePath("/admin/reservas");
      return { reservationId, orderId: booking.value.orderId, amount: booking.value.amount, customer: savedCustomer };
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
        ...(record ? { customerId: record.id } : {}),
        ...(discount ? { manualDiscount: discount } : {}),
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
    return { reservationId, orderId: booking.value.orderId, amount: booking.value.amount, customer: savedCustomer };
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
