"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { waTemplate } from "@/src/application/whatsapp/templates";
import { whatsappConfig, whatsappOutboxRepository, whatsappOutboxService, whatsappSender } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const NOT_CONFIGURED = "WhatsApp no está configurado (faltan KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID).";

/** Drena la cola ahora, sin esperar el próximo minuto del cron. */
export async function processNowAction(): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("whatsapp.manage");
    const r = await whatsappOutboxService().sweep();
    if (!r.configured) throw new Error(NOT_CONFIGURED);
    revalidatePath("/admin/whatsapp");
  });
}

/** Devuelve a la cola los fallidos que todavía no vencieron (p. ej. tras aprobar una plantilla). */
export async function retryFailedAction(): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("whatsapp.manage");
    if (!whatsappConfig().configured) throw new Error(NOT_CONFIGURED);
    await whatsappOutboxRepository().retryFailed();
    await whatsappOutboxService().sweep();
    revalidatePath("/admin/whatsapp");
  });
}

/**
 * Manda la plantilla `fotf_prueba` al OWNER_WHATSAPP, directo (sin cola): el error de Kapso/Meta
 * vuelve al toast tal cual, que es justo lo que sirve para depurar el alta. Queda en la bitácora.
 */
export async function sendTestAction(): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("whatsapp.manage");
    const c = whatsappConfig();
    if (!c.configured) throw new Error(NOT_CONFIGURED);
    if (!c.ownerWhatsapp) throw new Error("Falta OWNER_WHATSAPP (o es la línea del estudio): no hay a quién mandar la prueba.");
    const fecha = DateTime.now().setZone("America/Santiago").setLocale("es").toFormat("d 'de' LLLL 'a las' HH:mm");
    try {
      await whatsappSender().sendTemplate(c.ownerWhatsapp, waTemplate("test_ping", { fecha }));
    } catch (e) {
      // Mensaje del proveedor (sin secretos): "HTTP 400: (#132001) Template name does not exist…".
      throw new Error(`Kapso rechazó la prueba: ${e instanceof Error ? e.message : String(e)}`);
    }
    revalidatePath("/admin/whatsapp");
  });
}
