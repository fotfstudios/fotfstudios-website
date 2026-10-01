import { calendarSyncService } from "@/src/composition";

export const dynamic = "force-dynamic";
// El barrido corta a los 10 s (pg_net espera 15); esto es solo el techo de la función.
export const maxDuration = 60;

/**
 * Espejo de la agenda en Google Calendar: drena hasta 25 filas de `calendar_sync` por tick.
 * Lo dispara pg_cron cada minuto vía pg_net (mismo CRON_SECRET y mismos secretos de Vault que
 * access-codes). Sin credenciales de Google responde `configured: false` sin tocar la cola.
 */
async function handle(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    return Response.json(await calendarSyncService().sweep());
  } catch (e) {
    console.error("[cron-calendar-sync]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
