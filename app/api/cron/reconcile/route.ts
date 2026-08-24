import { expireAbandonedCourseHolds, reconcilePending, releaseAbandonedRedemptions } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Respaldo de fondo (A1): reconcilia contra Mercado Pago los pedidos que quedaron
 * `pending_payment` porque el webhook no llegó y el comprador no volvió a la página
 * de estado. Idempotente (inbox del webhook). Protegido por CRON_SECRET (Vercel lo
 * manda como Authorization: Bearer). Corre 1 vez al día → compatible con Vercel Hobby.
 * Después de reconciliar, libera los puntos canjeados en checkouts abandonados
 * (>72 h) y los cupos de curso retenidos por inscripciones que nunca se pagaron —
 * el reconcile va primero porque aún puede confirmar alguna.
 */
export async function GET(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const summary = await reconcilePending();
    const releasedPoints = await releaseAbandonedRedemptions().catch((e) => {
      console.error("[cron-reconcile:points]", e);
      return 0;
    });
    // Un cupo de curso retenido por un pedido muerto es inventario perdido: sale
    // del mismo barrido, después de que reconcile tuvo su oportunidad.
    const releasedSeats = await expireAbandonedCourseHolds().catch((e) => {
      console.error("[cron-reconcile:curso]", e);
      return 0;
    });
    return Response.json({ ...summary, releasedPoints, releasedSeats });
  } catch (e) {
    console.error("[cron-reconcile]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}
