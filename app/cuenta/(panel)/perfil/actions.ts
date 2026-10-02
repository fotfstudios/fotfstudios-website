"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { validateProfile } from "@/lib/profile";
import { customerService } from "@/src/composition";
import { assertCustomer } from "@/src/infrastructure/auth/require-customer";

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const session = await assertCustomer();
    const data = validateProfile({
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
    });
    // Una casilla desmarcada no viaja en el FormData: el campo oculto distingue "desmarcada" de
    // "formulario sin la casilla" (un POST viejo o ajeno nunca da de baja a nadie).
    const whatsappOptIn = fd.has("whatsapp_field") ? fd.get("whatsapp") === "on" : undefined;
    await customerService().updateProfileByUser(session.userId, data, whatsappOptIn);
    revalidatePath("/cuenta", "layout");
  });
}
