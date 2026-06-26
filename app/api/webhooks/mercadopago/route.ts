import { notificationService } from "@/src/composition";
import { WebhookService } from "@/src/application/payment/webhook-service";
import { createServiceClient } from "@/src/infrastructure/db/supabase-client";
import { SupabaseWebhookRepository } from "@/src/infrastructure/db/webhook-repository";
import { MercadoPagoGateway } from "@/src/infrastructure/payments/mercadopago/mercadopago-gateway";
import { verifyMpSignature } from "@/src/infrastructure/payments/mercadopago/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Webhook de Mercado Pago.
 *
 * **Fuente de verdad = la API de MP** (paso recomendado por MP tras la notificación:
 * GET v1/payments/{id}). Consultamos el pago con NUESTRO access token y solo
 * confirmamos pagos `approved` cuyo `external_reference` corresponde a una orden
 * nuestra pendiente, de forma idempotente (inbox). Una notificación falsa no logra
 * nada: nadie puede fabricar un pago real aprobado a nombre de una orden ajena.
 *
 * La **firma (x-signature) es defensa en profundidad**: la verificamos según la spec
 * oficial y la registramos, pero NO descartamos la notificación si no valida, porque
 * la verdad es la consulta a la API. Nota: los pagos de prueba (test-user) se firman
 * con el secreto de una app-sombra que no se puede configurar, así que en sandbox la
 * firma no calza; en producción (app real) sí valida y suma protección anti-spam.
 */
export async function POST(req: Request): Promise<Response> {
  const token = process.env.MP_ACCESS_TOKEN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !key) return new Response("not configured", { status: 503 });

  const reqUrl = new URL(req.url);
  const params = reqUrl.searchParams;
  // `data.id` del QUERY: lo exige la spec para el manifiesto de la firma.
  const queryDataId = params.get("data.id");

  const raw = await req.text();
  // ID del recurso para consultar el pago: del body si viene, si no del query.
  let resourceId = queryDataId ?? params.get("id") ?? "";
  let type = params.get("type") ?? params.get("topic") ?? "";
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (body?.data?.id) resourceId = String(body.data.id);
    if (body?.type) type = String(body.type);
  } catch {
    // body no-JSON: nos quedamos con los query params
  }

  // Firma best-effort (defensa en profundidad; ver doc del módulo).
  const secret = process.env.MP_WEBHOOK_SECRET;
  const signatureValid =
    !!secret &&
    verifyMpSignature({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId: queryDataId,
      secret,
    });
  if (!signatureValid) {
    console.warn("[mp-webhook] firma no validada; se procesa vía API de MP (fuente de verdad)");
  }

  // Solo notificaciones de pago.
  if (!type.includes("payment") || !resourceId) return new Response("ok", { status: 200 });

  const client = createServiceClient(url, key);
  const service = new WebhookService(new MercadoPagoGateway(token), new SupabaseWebhookRepository(client));
  try {
    const { result, orderId } = await service.handlePaymentNotification(resourceId);
    if (result === "paid" && orderId) {
      // Envío de emails (best-effort; el cron diario es el respaldo).
      await notificationService(client).notifyOrder(orderId).catch((e) => console.error("[mp-webhook:email]", e));
    }
  } catch (e) {
    console.error("[mp-webhook]", e);
  }
  return new Response("ok", { status: 200 });
}
