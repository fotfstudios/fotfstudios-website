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
  const secret = process.env.MP_WEBHOOK_SECRET;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !secret || !url || !key) return new Response("not configured", { status: 503 });

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

  const valid = verifyMpSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
    secret,
  });
  if (!valid) return new Response("invalid signature", { status: 401 });

  // Solo notificaciones de pago.
  if (!type.includes("payment") || !dataId) return new Response("ok", { status: 200 });

  const service = new WebhookService(
    new MercadoPagoGateway(token),
    new SupabaseWebhookRepository(createServiceClient(url, key)),
  );
  try {
    await service.handlePaymentNotification(dataId);
  } catch (e) {
    console.error("[mp-webhook]", e);
  }
  return new Response("ok", { status: 200 });
}
