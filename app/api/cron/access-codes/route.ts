import { accessCodeService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * PIN de la cerradura, cada 5 minutos: asigna código a las reservas confirmadas
 * que no tienen, y manda el de las que empiezan en los próximos ~15 min y ya
 * están CARGADAS en la Yale. Lo dispara pg_cron desde Supabase (Vercel Hobby
 * solo admite crons diarios), vía pg_net con el mismo CRON_SECRET que protege
 * los otros dos crons. Acepta GET y POST: pg_net manda POST; un cron de Vercel,
 * si algún día se migra, manda GET.
 */
async function handle(req: Request): Promise<Response> {
  // Fail-closed: sin CRON_SECRET configurado, el endpoint queda cerrado.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const result = await accessCodeService().sweep();
    return Response.json(result);
  } catch (e) {
    console.error("[cron-access-codes]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
