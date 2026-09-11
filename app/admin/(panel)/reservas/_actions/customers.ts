"use server";

import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import type { CreateCustomerOutcome } from "@/src/application/customers/customer-directory-service";
import type { CustomerProfile } from "@/src/application/ports/customers";
import { customerDirectory } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Acciones del picker de cliente, compartidas por la consola de reserva nueva y
 * por "Cambiar cliente" en la ficha de una reserva. Viven aparte de
 * `nueva/actions.ts` porque importar ese módulo desde la ficha arrastraría el
 * checkout y las notificaciones enteras.
 *
 * Van bajo `reservations.create` y no bajo `customers.manage`: agendar (y elegir
 * o crear un cliente para eso) es una cosa; administrar el directorio es otra,
 * y el dueño decidió que el staff no la tiene todavía.
 */
export async function searchCustomersAction(q: string): Promise<ActionDataResult<CustomerProfile[]>> {
  return runData(async () => {
    await requirePermission("reservations.create");
    return customerDirectory().search(q);
  });
}

/** Alta rápida. `exists` vuelve como dato, no como error. */
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
