import { reconcilePending } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Respaldo de fondo (A1): reconcilia contra Mercado Pago los pedidos que quedaron
 * `pending_payment` porque el webhook no llegó y el comprador no volvió a la página
 * de estado. Idempotente (inbox del webhook). Protegido por CRON_SECRET (Vercel lo
 * manda como Authorization: Bearer). Corre 1 vez al día → compatible con Vercel Hobby.
 */
export async function GET(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const summary = await reconcilePending();
    return Response.json(summary);
  } catch (e) {
    console.error("[cron-reconcile]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}
