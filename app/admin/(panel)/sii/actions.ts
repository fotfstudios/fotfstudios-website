"use server";

import { type ActionResult, run } from "@/components/admin/ui/action";
import { recordTaxDocFolioFromForm } from "@/components/admin/tax-docs/record-folio";

/** Registrar folio SII desde la cola — cuerpo compartido en components/admin/tax-docs/record-folio.ts. */
export async function recordTaxDocFolioAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(() => recordTaxDocFolioFromForm(fd));
}
