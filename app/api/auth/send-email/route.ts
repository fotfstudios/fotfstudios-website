import { SendEmailHookService } from "@/src/application/auth/send-email-hook";
import { mailer } from "@/src/composition";

export const dynamic = "force-dynamic";

/**
 * Send Email Hook de Supabase Auth → nuestras plantillas + Resend + bitácora.
 * Se activa por proyecto en el Dashboard (Auth → Hooks → Send Email: esta URL +
 * secreto) y en local descomentando `[auth.hook.send_email]` en config.toml. Hasta
 * que el dueño lo active, Auth sigue mandando con sus propias plantillas.
 * Adaptador fino: la lógica y los tests viven en send-email-hook.ts.
 */
export async function POST(req: Request): Promise<Response> {
  const service = new SendEmailHookService({
    secrets: process.env.SEND_EMAIL_HOOK_SECRET ?? "",
    mailer: mailer(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  });
  const raw = await req.text();
  const res = await service.handle(raw, {
    "webhook-id": req.headers.get("webhook-id"),
    "webhook-timestamp": req.headers.get("webhook-timestamp"),
    "webhook-signature": req.headers.get("webhook-signature"),
  });
  return Response.json(res.body, { status: res.status });
}
