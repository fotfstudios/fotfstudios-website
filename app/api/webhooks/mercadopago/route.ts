import { notificationService } from "@/src/composition";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { createServiceClient } from "@/src/infrastructure/db/supabase-client";
import { SupabaseWebhookRepository } from "@/src/infrastructure/db/webhook-repository";
import { MercadoPagoGateway } from "@/src/infrastructure/payments/mercadopago/mercadopago-gateway";
import { verifyMpSignature } from "@/src/infrastructure/payments/mercadopago/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Webhook de Mercado Pago = fuente de verdad del pago. Verifica firma →
 * deduplica (inbox) → consulta el pago en MP → confirma/cancela. Responde 200
 * rápido para evitar tormenta de reintentos; la reconciliación atrapa lo perdido.
 */
export async function POST(req: Request): Promise<Response> {
  const token = process.env.MP_ACCESS_TOKEN;
  // MP firma con secretos distintos en prueba vs producción (y los pagos de
  // test-user llegan como live_mode). Aceptamos cualquiera de los configurados.
  const secrets = [process.env.MP_WEBHOOK_SECRET, process.env.MP_WEBHOOK_SECRET_TEST].filter(
    (s): s is string => Boolean(s),
  );
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || secrets.length === 0 || !url || !key) {
    return new Response("not configured", { status: 503 });
  }

  const raw = await req.text();
  const params = new URL(req.url).searchParams;
  let dataId = params.get("data.id") ?? params.get("id") ?? "";
  let type = params.get("type") ?? params.get("topic") ?? "";
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (body?.data?.id) dataId = String(body.data.id);
    if (body?.type) type = String(body.type);
  } catch {
    // body no-JSON: nos quedamos con los query params
  }

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  const valid = secrets.some((secret) => verifyMpSignature({ xSignature, xRequestId, dataId, secret }));
  if (!valid) return new Response("invalid signature", { status: 401 });

  // Solo notificaciones de pago.
  if (!type.includes("payment") || !dataId) return new Response("ok", { status: 200 });

  const client = createServiceClient(url, key);
  const service = new WebhookService(new MercadoPagoGateway(token), new SupabaseWebhookRepository(client));
  try {
    const { result, orderId } = await service.handlePaymentNotification(dataId);
    if (result === "paid" && orderId) {
      // Envío de emails (best-effort; el cron diario es el respaldo).
      await notificationService(client).notifyOrder(orderId).catch((e) => console.error("[mp-webhook:email]", e));
    }
  } catch (e) {
    console.error("[mp-webhook]", e);
  }
  return new Response("ok", { status: 200 });
}
