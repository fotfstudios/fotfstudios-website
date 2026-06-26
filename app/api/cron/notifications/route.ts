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
    const notified = await notificationService().notifyPending();
    return Response.json({ notified });
  } catch (e) {
    console.error("[cron-notifications]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}
