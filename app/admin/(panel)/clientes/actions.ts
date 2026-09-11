"use server";

import { revalidatePath } from "next/cache";
import { type ActionDataResult, runData } from "@/components/admin/ui/action";
import type { CreateCustomerOutcome } from "@/src/application/customers/customer-directory-service";
import type { CustomerProfile } from "@/src/application/ports/customers";
import { customerDirectory } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

/**
 * Alta desde /admin/clientes. Mismo servicio que la consola de reservas, pero
 * bajo `customers.manage`: administrar el directorio es un permiso aparte que
 * el staff no tiene, mientras que agendar (y crear una ficha al vuelo para eso)
 * va con `reservations.create`. `exists` vuelve como dato, no como error.
 */
export async function createCustomerAction(raw: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}): Promise<ActionDataResult<CreateCustomerOutcome>> {
  return runData(async () => {
    await requirePermission("customers.manage");
    const r = await customerDirectory().create(raw);
    if (!r.ok) throw new Error(r.error);
    revalidatePath("/admin/clientes");
    return r.value;
  });
}

/** Aviso blando al tipear un teléfono ya conocido. Nunca elige por el staff. */
export async function lookupCustomerPhoneAction(phone: string): Promise<ActionDataResult<CustomerProfile | null>> {
  return runData(async () => {
    await requirePermission("customers.manage");
    return customerDirectory().lookupPhone(phone);
  });
}
