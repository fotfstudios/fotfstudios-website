import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { notificationService, rescheduleNotifyInfo } from "@/src/composition";
import { WebhookService } from "@/src/application/payment/webhook-service";
import type { Database } from "@/src/infrastructure/db/database.types";
import { createServiceClient } from "@/src/infrastructure/db/supabase-client";
import { SupabaseCourseRepository } from "@/src/infrastructure/db/course-repository";
import { SupabaseRescheduleRepository } from "@/src/infrastructure/db/reschedule-repository";
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
 * La **firma (x-signature) es defensa en profundidad**: la validamos con el
 * validador oficial del SDK de MP (ver verify-signature.ts) y la registramos,
 * pero NO descartamos la notificación si no valida, porque la verdad es la
 * consulta a la API. Nota: las notificaciones **IPN legacy** (`?id=&topic=`)
 * traen `x-signature` pero MP no soporta validarlas con la clave secreta —
 * calzan en `false` por diseño; las **Webhooks** (`?data.id=&type=`) sí validan
 * cuando la clave secreta del entorno coincide con la del panel (test/prod).
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
  // Forma de entrega: Webhooks del panel (`?data.id=&type=`, firma validable)
  // vs IPN legacy (`?id=&topic=`, firma no validable por diseño).
  const forma = params.has("data.id") ? "webhooks" : params.has("topic") ? "ipn" : "desconocida";
  if (signatureValid) {
    console.info(`[mp-webhook] firma ok (forma=${forma})`);
  } else {
    console.warn(`[mp-webhook] firma no validada (forma=${forma}); se procesa vía API de MP (fuente de verdad)`);
  }

  // Solo notificaciones de pago.
  if (!type.includes("payment") || !resourceId) return new Response("ok", { status: 200 });

  const client = createServiceClient(url, key);
  // Con los dos finalizadores: los pedidos SIN reserva —delta de reagendamiento e
  // inscripción de curso— se finalizan por su propio camino en vez del confirm
  // normal, que los mandaría a 'paid_no_hold' (sin boleta, cliente en silencio).
  const service = new WebhookService(
    new MercadoPagoGateway(token),
    new SupabaseWebhookRepository(client),
    new SupabaseRescheduleRepository(client),
    new SupabaseCourseRepository(client),
  );
  try {
    const { result, orderId, refundedAmount } = await service.handlePaymentNotification(resourceId);
    if (result === "paid" && orderId) {
      // Envío de emails (best-effort; el cron diario es el respaldo).
      await notificationService(client).notifyOrder(orderId).catch((e) => console.error("[mp-webhook:email]", e));
    } else if (result === "paid_unreserved" && orderId) {
      // Pagó pero el hold ya no existía: NO se confirma al cliente; se alerta al dueño.
      console.error(`[mp-webhook] PAGO SIN RESERVA — revisar/refund (order ${orderId}, pago ${resourceId})`);
      await notificationService(client)
        .notifyPaymentNeedsReview(orderId, resourceId)
        .catch((e) => console.error("[mp-webhook:review]", e));
    } else if (result === "course_paid" && orderId) {
      // Inscripción de curso pagada por MP: cupos confirmados y boleta emitida por
      // el finalizador. El email va por el camino del curso (notifyOrder ignora
      // los pedidos de curso a propósito).
      await notifyCoursePaidFromWebhook(orderId, client).catch((e) =>
        console.error("[mp-webhook:curso-email]", e),
      );
    } else if (result === "refunded" && orderId) {
      // Reembolso hecho FUERA del admin (panel de MP): avisar al cliente. Los
      // reembolsos admin no llegan aquí (inbox dedupe) — su email lo manda la acción.
      await notificationService(client)
        .notifyCancellation(orderId, { refundAmount: refundedAmount ?? null })
        .catch((e) => console.error("[mp-webhook:cancel-email]", e));
    } else if ((result === "reschedule_applied" || result === "reschedule_slot_taken") && orderId) {
      // `orderId` acá es la orden de DELTA; el aviso es sobre la reserva ORIGINAL.
      const info = await rescheduleNotifyInfo(orderId, client).catch(() => null);
      if (info) {
        if (result === "reschedule_applied") {
          await notificationService(client)
            .notifyReschedule(info.originalOrderId, { refundAmount: 0 })
            .catch((e) => console.error("[mp-webhook:reschedule-email]", e));
        } else {
          // Slot tomado al pagar: se devolvió el excedente; la reserva NO se movió.
          console.error(`[mp-webhook] REAGENDAMIENTO SIN CUPO — excedente devuelto (order ${info.originalOrderId})`);
          await notificationService(client)
            .notifyRescheduleFailed(info.originalOrderId, { refundAmount: info.delta })
            .catch((e) => console.error("[mp-webhook:reschedule-failed-email]", e));
        }
      }
    }
  } catch (e) {
    console.error("[mp-webhook]", e);
  }
  return new Response("ok", { status: 200 });
}

/**
 * Aviso de inscripción pagada tras el webhook. Reúne los datos que el email
 * necesita (alumnos del pedido, generación, sesiones agendadas) y delega en
 * NotificationService.
 */
async function notifyCoursePaidFromWebhook(
  orderId: string,
  client: SupabaseClient<Database>,
): Promise<void> {
  const repo = new SupabaseCourseRepository(client);
  const inscripciones = await repo.enrollmentsByOrder(orderId);
  if (inscripciones.length === 0) return;
  const gen = await repo.getGeneration(inscripciones[0].generationId);
  const sesiones = gen ? await repo.listSessions(gen.id) : [];
  await notificationService(client).notifyCoursePaid({
    students: inscripciones.map((i) => ({ name: i.studentName, email: i.studentEmail })),
    generation: inscripciones[0].generationCode,
    totalClp: inscripciones[0].orderAmountClp ?? 0,
    method: "Mercado Pago",
    sessions: sesiones
      .filter((s) => s.status === "agendada" && s.startsAt)
      .map((s) =>
        DateTime.fromISO(s.startsAt!).setZone("America/Santiago").setLocale("es")
          .toFormat("cccc d 'de' LLLL, HH:mm 'h'"),
      ),
    seatsLeft: gen?.seatsLeft ?? 0,
  });
}
