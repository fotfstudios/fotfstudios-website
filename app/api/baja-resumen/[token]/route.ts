import { beatcoinsCampaignRepository } from "@/src/composition";
import { UNSUBSCRIBE_TOKEN_RE } from "@/src/domain/newsletter/subscribe";

export const dynamic = "force-dynamic";

/**
 * Baja de un clic del resumen mensual de Beatcoins (RFC 8058): Gmail y Outlook hacen
 * `POST` a la URL de `List-Unsubscribe` con `List-Unsubscribe=One-Click` cuando la persona
 * toca su "Anular suscripción". Siempre 200 con un token bien formado (no revela si existe).
 * Un `GET` (alguien abrió la URL) va a la página con botón: los escáneres de correo abren
 * links con GET y no pueden dar de baja a nadie.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!UNSUBSCRIBE_TOKEN_RE.test(token)) return new Response("bad token", { status: 400 });
  try {
    await beatcoinsCampaignRepository().unsubscribeDigest(token);
  } catch (e) {
    console.error("[baja-resumen]", e);
    return new Response("error", { status: 503 });
  }
  return new Response("ok", { status: 200 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!UNSUBSCRIBE_TOKEN_RE.test(token)) return new Response("bad token", { status: 400 });
  return Response.redirect(new URL(`/baja-resumen/${token}`, req.url), 303);
}
