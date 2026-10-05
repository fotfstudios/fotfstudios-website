import { whatsappOutboxRepository } from "@/src/composition";
import { parseKapsoStatusEvent } from "@/src/infrastructure/whatsapp/kapso-webhook";
import { verifyKapsoSignature } from "@/src/infrastructure/whatsapp/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Webhook de estado de Kapso: sent / delivered / read / failed de los avisos de la cola.
 *
 * La firma ES la verdad (a diferencia de Mercado Pago, donde la verdad es la API): sin secreto
 * responde 503 y con firma inválida 401. Se verifica sobre el body CRUDO.
 *
 * Idempotencia: aplicar un estado es monótono (sent < delivered < read; failed terminal), así que
 * una re-entrega no cambia nada. La X-Idempotency-Key queda registrada después de aplicar, como
 * rastro (y un `duplicate` en el log); si aplicar falla, se responde 500 y Kapso reintenta (10 s,
 * 40 s). Hay que responder en < 10 s: son dos llamadas a la DB.
 *
 * Mensajes que no son de la cola (los que el dueño escribe desde la app Business, entrantes,
 * otros eventos) responden 200 sin hacer nada: un error haría que Kapso pause el webhook.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  if (!verifyKapsoSignature(raw, req.headers.get("x-webhook-signature"), secret)) {
    console.warn("[kapso-webhook] firma inválida");
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const event = req.headers.get("x-webhook-event");
  const parsed = parseKapsoStatusEvent(event, body);
  if (!parsed) return Response.json({ ok: true, ignored: true });

  const repo = whatsappOutboxRepository();
  try {
    const applied = await repo.applyStatus(parsed.providerId, parsed.status, parsed.code, parsed.message);
    const key = req.headers.get("x-idempotency-key");
    const first = key ? await repo.claimWebhook(key.slice(0, 200), event ?? "") : true;
    console.info(
      `[kapso-webhook] firma ok ${parsed.status} ${parsed.providerId}${applied ? "" : " (sin cambio)"}${first ? "" : " (duplicate)"}`,
    );
    return Response.json({ ok: true, applied });
  } catch (e) {
    console.error("[kapso-webhook]", e);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
