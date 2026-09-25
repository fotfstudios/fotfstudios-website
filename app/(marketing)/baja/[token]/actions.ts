"use server";

import { redirect } from "next/navigation";
import { newsletterService } from "@/src/composition";
import { UNSUBSCRIBE_TOKEN_RE } from "@/src/domain/newsletter/subscribe";

/**
 * La baja ocurre SOLO acá, en el POST del botón: los escáneres de correo (Outlook Safe
 * Links, antivirus corporativos) abren los links con GET antes que la persona, y una baja
 * en el GET daría de baja a gente que nunca lo pidió.
 */
export async function confirmarBaja(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  // La forma se valida antes de armar la URL del redirect: nada del form llega crudo a ella.
  if (!UNSUBSCRIBE_TOKEN_RE.test(token)) redirect("/");
  const result = await newsletterService().unsubscribe(token);
  redirect(`/baja/${token}?${result.ok ? "listo=1" : "error=1"}`);
}
