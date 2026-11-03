import { nurtureService } from "@/src/composition";

export const dynamic = "force-dynamic";
// El barrido es acotado; esto es solo el techo de la función.
export const maxDuration = 60;

/**
 * Secuencia de nurture: manda el paso que toque (día 2/5/9/14) de cada lead inscrito. Lo dispara
 * pg_cron cada 5 min vía pg_net (mismo CRON_SECRET y secretos de Vault que access-codes/whatsapp).
 * Local, sin los secretos de Vault, nunca se dispara solo: se invoca a mano para probar.
 */
async function handle(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    return Response.json(await nurtureService().sweep());
  } catch (e) {
    console.error("[cron-outreach]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
