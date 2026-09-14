import { notificationService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Respaldo diario: reenvía emails de reservas pagadas sin notificar (por si el
 * webhook falló al enviar). Protegido por CRON_SECRET (Vercel lo manda como
 * Authorization: Bearer). Corre 1 vez al día → compatible con Vercel Hobby.
 */
export async function GET(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const result = await notificationService().notifyPending();
    // Con fallos el cron responde 503: Vercel lo marca como fallido y queda a la vista.
    // Antes devolvía `{ notified: 0 }` como si nada cuando el proveedor estaba caído.
    return Response.json(result, { status: result.failed > 0 ? 503 : 200 });
  } catch (e) {
    console.error("[cron-notifications]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}
