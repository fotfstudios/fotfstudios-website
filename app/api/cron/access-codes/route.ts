import { accessCodeService, reminderService } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Barrido de 5 minutos (PIN + recordatorio). PIN: asigna código a las reservas
 * confirmadas que no tienen, y manda el de las que empiezan en los próximos ~15 min
 * y ya están CARGADAS en la Yale. Recordatorio: a las que empiezan dentro de 24 h.
 * Cada mitad es independiente: un fallo en una no frena a la otra (se reporta).
 * Lo dispara pg_cron desde Supabase (Vercel Hobby
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
    const access = await accessCodeService().sweep();
    const reminders = await reminderService()
      .sweep()
      .catch((e) => {
        console.error("[cron-reminders]", e);
        return { error: "server" as const };
      });
    return Response.json({ ...access, reminders });
  } catch (e) {
    console.error("[cron-access-codes]", e);
    return Response.json({ error: "server" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
