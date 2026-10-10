"use server";

import { redirect } from "next/navigation";
import { beatcoinsCampaignRepository } from "@/src/composition";
import { UNSUBSCRIBE_TOKEN_RE } from "@/src/domain/newsletter/subscribe";

/**
 * La baja del resumen ocurre SOLO acá, en el POST del botón (o en el de un clic de
 * /api/baja-resumen): los escáneres de correo abren los links con GET.
 */
export async function confirmarBajaResumen(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!UNSUBSCRIBE_TOKEN_RE.test(token)) redirect("/");
  const ok = await beatcoinsCampaignRepository()
    .unsubscribeDigest(token)
    .catch((e) => {
      console.error("[baja-resumen]", e);
      return false;
    });
  redirect(`/baja-resumen/${token}?${ok ? "listo=1" : "error=1"}`);
}
