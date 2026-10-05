import { whatsappOutboxService } from "@/src/composition";

export const dynamic = "force-dynamic";
// El barrido corta a los 10 s (pg_net espera 15); esto es solo el techo de la función.
export const maxDuration = 60;

/**
 * Cola de avisos por WhatsApp: manda lo debido de `whatsapp_outbox`. Lo dispara pg_cron cada
 * minuto vía pg_net (mismo CRON_SECRET y mismos secretos de Vault que access-codes). Sin las
 * variables de Kapso responde `configured: false` sin tocar la cola.
 */
async function handle(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    return Response.json(await whatsappOutboxService().sweep());
  } catch (e) {
    console.error("[cron-whatsapp-outbox]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
