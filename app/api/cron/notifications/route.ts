import { beatcoinsExpiryService, notificationService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Cron diario (13:00, Vercel Hobby → precisión de la hora):
 *   · respaldo: reenvía emails de reservas pagadas sin notificar (por si el webhook falló);
 *   · vencimiento de Beatcoins y sus avisos.
 * Protegido por CRON_SECRET (Vercel lo manda como Authorization: Bearer). Cada tarea con
 * su propio catch: una caída de una no frena la otra.
 */
export async function GET(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const [pending, beatcoins] = await Promise.all([
    notificationService()
      .notifyPending()
      .catch((e) => {
        console.error("[cron-notifications]", e);
        return null;
      }),
    beatcoinsExpiryService()
      .sweep()
      .catch((e) => {
        console.error("[cron-notifications:beatcoins]", e);
        return null;
      }),
  ]);
  // Con fallos el cron responde 503: Vercel lo marca como fallido y queda a la vista.
  const failed = !pending || !beatcoins || pending.failed > 0 || beatcoins.failed > 0;
  return Response.json({ ...(pending ?? { error: "server" }), beatcoins }, { status: failed ? 503 : 200 });
}
