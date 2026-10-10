import { beatcoinsCampaignService, beatcoinsExpiryService, notificationService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Cron diario (13:00, Vercel Hobby → precisión de la hora):
 *   · respaldo: reenvía emails de reservas pagadas sin notificar (por si el webhook falló);
 *   · vencimiento de Beatcoins y sus avisos;
 *   · campaña de Beatcoins: anuncio encolado desde el admin y resumen mensual.
 * Protegido por CRON_SECRET (Vercel lo manda como Authorization: Bearer). Cada tarea con
 * su propio catch: una caída de una no frena las otras.
 */
export async function GET(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const guard = <T,>(tag: string, p: Promise<T>): Promise<T | null> =>
    p.catch((e) => {
      console.error(tag, e);
      return null;
    });
  const pending = await guard("[cron-notifications]", notificationService().notifyPending());
  // En serie: el vencimiento antes de la campaña (el resumen cuenta el saldo ya vencido).
  const beatcoins = await guard("[cron-notifications:beatcoins]", beatcoinsExpiryService().sweep());
  const campaign = await guard("[cron-notifications:campaign]", beatcoinsCampaignService().sweep());
  // Con fallos el cron responde 503: Vercel lo marca como fallido y queda a la vista.
  const failed =
    !pending || !beatcoins || !campaign || pending.failed > 0 || beatcoins.failed > 0 || campaign.failed > 0;
  return Response.json({ ...(pending ?? { error: "server" }), beatcoins, campaign }, { status: failed ? 503 : 200 });
}
