/**
 * Composition root — ensambla servicios de aplicación con adaptadores concretos
 * (Supabase, Mercado Pago). Único lugar que conoce ambas capas; `app/` (rutas)
 * importa desde aquí. Lee la config de entorno de forma perezosa (en request).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE, SITE_URL } from "@/lib/site";
import { requireEnv } from "@/lib/env";
import { resolveSiteUrl } from "@/lib/urls";
import { SupabaseAdminRepository } from "@/src/infrastructure/db/admin-repository";
import { SupabaseApplicationRepository } from "@/src/infrastructure/db/application-repository";
import { SupabaseCourseRepository } from "@/src/infrastructure/db/course-repository";
import { SupabaseRateLimiter } from "@/src/infrastructure/db/rate-limit-repository";
import { AvailabilityService } from "@/src/application/availability/availability-service";
import { NotificationService } from "@/src/application/notifications/notification-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { FirstBookingPromoService } from "@/src/application/checkout/first-booking-promo";
import { PaymentService } from "@/src/application/payment/payment-service";
import { WebhookService, type WebhookResult } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseWebhookRepository } from "@/src/infrastructure/db/webhook-repository";
import { MemberService } from "@/src/application/admin/member-service";
import { RefundService } from "@/src/application/admin/refund-service";
import { RescheduleService } from "@/src/application/admin/reschedule-service";
import { SupabaseRescheduleRepository } from "@/src/infrastructure/db/reschedule-repository";
import { CustomerService } from "@/src/application/customers/customer-service";
import { CustomerDirectoryService } from "@/src/application/customers/customer-directory-service";
import { AccessCodeService } from "@/src/application/access/access-code-service";
import { SupabaseCustomerRepository } from "@/src/infrastructure/db/customer-repository";
import { SupabaseMemberRepository } from "@/src/infrastructure/db/member-repository";
import { SupabaseInviter } from "@/src/infrastructure/auth/auth-admin";
import type { Mailer } from "@/src/application/ports/mailer";
import type { OrderConfirmation } from "@/src/application/ports/orders";
import { SupabaseCheckoutRepository } from "@/src/infrastructure/db/checkout-repository";
import { SupabasePromoRepository } from "@/src/infrastructure/db/promo-repository";
import type { Database } from "@/src/infrastructure/db/database.types";
import { SupabaseNotificationRepository } from "@/src/infrastructure/db/notification-repository";
import { SupabaseOrderRepository } from "@/src/infrastructure/db/order-repository";
import { SupabaseRatePlanRepository } from "@/src/infrastructure/db/rate-plan-repository";
import { SupabaseSchedulingRepository } from "@/src/infrastructure/db/scheduling-repository";
import { serviceClientFromEnv } from "@/src/infrastructure/db/supabase-client";
import { ResendMailer, NoopMailer } from "@/src/infrastructure/email/resend-mailer";
import { LoggedMailer } from "@/src/application/notifications/logged-mailer";
import { ReminderService } from "@/src/application/reminders/reminder-service";
import { SupabaseReminderRepository } from "@/src/infrastructure/db/reminder-repository";
import { SupabaseNotificationLogRepository } from "@/src/infrastructure/db/notification-log-repository";
import { MercadoPagoGateway } from "@/src/infrastructure/payments/mercadopago/mercadopago-gateway";

/** Cliente Supabase service-role (servidor). */
export function db(): SupabaseClient<Database> {
  return serviceClientFromEnv();
}

export function availabilityService(client: SupabaseClient<Database> = db()): AvailabilityService {
  return new AvailabilityService(new SupabaseSchedulingRepository(client));
}

export function pricingService(client: SupabaseClient<Database> = db()): PricingService {
  return new PricingService(new SupabaseRatePlanRepository(client));
}

/** Promo de primera reserva: elegibilidad por correo (la aplica el checkout público; la previsualiza /api/promos). */
export function firstBookingPromo(client: SupabaseClient<Database> = db()): FirstBookingPromoService {
  return new FirstBookingPromoService(new SupabasePromoRepository(client));
}

export function checkoutService(client: SupabaseClient<Database> = db()): CheckoutService {
  return new CheckoutService(
    new PricingService(new SupabaseRatePlanRepository(client)),
    new SupabaseCheckoutRepository(client),
    firstBookingPromo(client),
  );
}

export function paymentService(
  client: SupabaseClient<Database> = db(),
  requestHost?: string | null,
): PaymentService {
  return new PaymentService(
    new MercadoPagoGateway(requireEnv("MP_ACCESS_TOKEN")),
    new SupabaseOrderRepository(client),
    {
      siteUrl: resolveSiteUrl(requestHost),
      // Opt-in dev-only (ver PaymentServiceConfig): vacío/ausente → undefined,
      // y MP notifica vía los Webhooks del panel (firma validable).
      notificationUrl: process.env.MP_NOTIFICATION_URL || undefined,
    },
  );
}

/** Vista de confirmación (sin PII de contacto) para la página /reserva/estado. */
export function orderConfirmation(
  orderId: string,
  client: SupabaseClient<Database> = db(),
): Promise<OrderConfirmation | null> {
  return new SupabaseOrderRepository(client).getOrderConfirmation(orderId);
}

/**
 * Reconciliación bajo demanda: consulta a MP el pago de la orden y, si está
 * aprobado, lo confirma (idempotente). Respaldo cuando el webhook no llega
 * (MP no entrega notificaciones de pagos de prueba de forma confiable, y en
 * prod puede perderse alguna). La verdad es siempre la API de MP.
 */
export async function reconcileOrder(
  orderId: string,
  client: SupabaseClient<Database> = db(),
): Promise<WebhookResult | null> {
  const gateway = new MercadoPagoGateway(requireEnv("MP_ACCESS_TOKEN"));
  const payment = await gateway.findPaymentByOrder(orderId);
  if (!payment) return null;
  // Con los dos finalizadores: los pedidos SIN reserva —delta de reagendamiento e
  // inscripción de curso— se finalizan por su propio camino en vez del confirm
  // normal. Va acá y no solo en la ruta del webhook a propósito: si el webhook se
  // pierde, este barrido es el que reconcilia, y sin el finalizador mandaría al
  // dueño una alerta falsa de "pagó sin reserva".
  const service = new WebhookService(
    gateway,
    new SupabaseWebhookRepository(client),
    new SupabaseRescheduleRepository(client),
    new SupabaseCourseRepository(client),
  );
  return service.handlePaymentNotification(payment.id);
}

/**
 * Barrido de reconciliación de fondo (A1): respaldo para pedidos `pending_payment`
 * cuyo webhook no llegó y cuyo comprador no volvió a la página de estado. Recorre los
 * pedidos pendientes (más viejos que el hold, dentro de `withinHours`) y los reconcilia
 * contra MP. Idempotente vía el inbox del webhook. Para `paid_unreserved` alerta al
 * dueño (el cliente NO recibe confirmación; ver confirm_payment). Devuelve un resumen.
 */
export async function reconcilePending(
  client: SupabaseClient<Database> = db(),
): Promise<{
  scanned: number;
  paid: number;
  unreserved: number;
  rescheduleRefundsRetried: number;
  chargeRefundsRetried: number;
}> {
  const orders = new SupabaseOrderRepository(client);
  const ids = await orders.pendingOrderIds({ olderThanMinutes: 11, withinHours: 72 });
  let paid = 0;
  let unreserved = 0;
  for (const id of ids) {
    try {
      const res = await reconcileOrder(id, client);
      if (res?.result === "paid") paid++;
      else if (res?.result === "paid_unreserved") {
        unreserved++;
        await notificationService(client)
          .notifyPaymentNeedsReview(id, res.orderId ?? id)
          .catch((e) => console.error("[reconcile:review]", e));
      }
    } catch (e) {
      console.error("[reconcile]", id, e);
    }
  }
  // Barre cobros de reagendamiento diferidos abandonados (best-effort).
  await expireAbandonedReschedules(client).catch((e) => console.error("[reconcile:reschedules]", e));
  // Barre reservas manuales pendientes abandonadas (hold firme, best-effort).
  await expireAbandonedManualHolds(client).catch((e) => console.error("[reconcile:manual-holds]", e));
  // H1/H9: reintenta reembolsos de reagendamiento que quedaron pendientes (MP falló o los
  // dejó en contingencia) y cobros fallidos cuyo delta se capturó pero nunca se devolvió.
  const rescheduleRefundsRetried = await retryPendingRescheduleRefunds(client).catch((e) => {
    console.error("[reconcile:reschedule-refunds]", e);
    return 0;
  });
  const chargeRefundsRetried = await retryFailedChargeRefunds(client).catch((e) => {
    console.error("[reconcile:charge-refunds]", e);
    return 0;
  });
  return { scanned: ids.length, paid, unreserved, rescheduleRefundsRetried, chargeRefundsRetried };
}

/**
 * H1: reintenta reembolsos de reagendamiento que quedaron pendientes (fila `pending_refund`
 * viva) porque MP falló o los dejó en contingencia (`in_process`) — respaldo del "Reintentar"
 * manual del admin. Por fila, no por lote: un `getRefund` que lanza no debe tumbar el resto.
 */
export async function retryPendingRescheduleRefunds(client: SupabaseClient<Database> = db()): Promise<number> {
  const repo = new SupabaseRescheduleRepository(client);
  const svc = rescheduleService(client);
  let n = 0;
  const stillPending: { rescheduleId: string; reason: string }[] = [];
  for (const id of await repo.pendingRefundIds({ olderThanMinutes: 10 })) {
    const r = await svc.retryRefund(id).catch((e) => {
      console.error("[reconcile:reschedule-refund]", id, e);
      return null;
    });
    if (r?.ok && r.value.kind === "refunded") n++;
    if (r?.ok && r.value.kind === "refund_pending") stillPending.push({ rescheduleId: id, reason: r.value.reason });
  }
  // Lo que sigue pendiente tras el barrido queda a la vista en los logs de Vercel: un
  // `in_process` que no se destraba en varios ticks es para mirar en el panel de MP.
  for (const p of stillPending) console.warn("[reconcile:reschedule-refund] sigue pendiente", p);
  return n;
}

/**
 * H9: reintenta devolver el delta de cobros de reagendamiento que no se aplicaron (slot
 * tomado / reserva cancelada / link anulado) y cuyo dinero se capturó en MP pero el webhook
 * no logró devolverlo (MP caído en ese momento). Manda el email "no se pudo reagendar" recién
 * cuando el reembolso queda hecho — antes no hay nada nuevo que avisarle al cliente.
 */
export async function retryFailedChargeRefunds(client: SupabaseClient<Database> = db()): Promise<number> {
  const repo = new SupabaseRescheduleRepository(client);
  const svc = rescheduleService(client);
  let n = 0;
  for (const row of await repo.unrefundedFailedCharges()) {
    try {
      if ((await svc.retryFailedChargeRefund(row)) === "done") {
        n++;
        const info = await rescheduleNotifyInfo(row.deltaOrderId, client).catch(() => null);
        if (info) {
          await notificationService(client)
            .notifyRescheduleFailed(info.originalOrderId, { refundAmount: info.delta })
            .catch((e) => console.error("[reconcile:charge-refund-email]", e));
        }
      }
    } catch (e) {
      console.error("[reconcile:charge-refund]", row.rescheduleId, e);
    }
  }
  return n;
}

/** Bitácora de correos: cada intento (ok o fallo) queda en notification_log; /admin la muestra. */
export function notificationLogRepository(client: SupabaseClient<Database> = db()): SupabaseNotificationLogRepository {
  return new SupabaseNotificationLogRepository(client);
}

/** Mailer real (Resend) o no-op sin API key; en ambos casos envuelto en la bitácora. */
export function mailer(client: SupabaseClient<Database> = db()): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "FOTF Studios <reservas@fotfstudios.cl>";
  const real = key ? new ResendMailer(key, from, process.env.EMAIL_REPLY_TO || undefined) : new NoopMailer();
  return new LoggedMailer(real, notificationLogRepository(client));
}

export function notificationService(client: SupabaseClient<Database> = db()): NotificationService {
  return new NotificationService(mailer(client), new SupabaseNotificationRepository(client), {
    ownerEmail: process.env.OWNER_EMAIL ?? "",
    // Origen de los links del correo (recibo, cuenta, reservar): el del ENTORNO, como las
    // back_urls de MP — prod → www, local → NEXT_PUBLIC_SITE_URL. Con el canónico fijo, un
    // correo de prueba local mandaba al cliente al recibo de prod (404: la orden vive acá).
    // T&C y privacidad siguen canónicos: son documentos, no la reserva.
    siteUrl: resolveSiteUrl(),
    tz: "America/Santiago",
    address: SITE.address,
    mapsUrl: SITE.mapsUrl,
    whatsappUrl: `https://wa.me/${SITE.whatsapp}`,
    termsUrl: `${SITE_URL}/terminos`,
    privacyUrl: `${SITE_URL}/privacidad`,
  });
}

export function adminRepository(client: SupabaseClient<Database> = db()): SupabaseAdminRepository {
  return new SupabaseAdminRepository(client);
}

/** Postulaciones de DJ (/unete): alta pública + lista/triage del admin. */
export function applicationRepository(
  client: SupabaseClient<Database> = db(),
): SupabaseApplicationRepository {
  return new SupabaseApplicationRepository(client);
}

/** Curso de DJ: agenda de sesiones de una generación (bloques de sala). */
export function courseRepository(
  client: SupabaseClient<Database> = db(),
): SupabaseCourseRepository {
  return new SupabaseCourseRepository(client);
}

/** Rate limiter por clave (Postgres, ventana fija). Antiabuso de endpoints públicos. */
export function rateLimiter(client: SupabaseClient<Database> = db()): SupabaseRateLimiter {
  return new SupabaseRateLimiter(client);
}

/**
 * Cancelación de reserva con reembolso opcional (total o parcial) en Mercado Pago.
 * Comparte el inbox del webhook: idempotencia por refund id contra el loopback.
 */
export function refundService(client: SupabaseClient<Database> = db()): RefundService {
  return new RefundService(
    new MercadoPagoGateway(requireEnv("MP_ACCESS_TOKEN")),
    adminRepository(client),
    new SupabaseWebhookRepository(client),
  );
}

/**
 * Reagendamiento (admin): mueve una reserva pagada a otro horario con manejo del
 * delta de precio en MP. Comparte el inbox del webhook (dedupe por refund id) para
 * que el loopback no cancele el booking que se mantiene vivo.
 */
export function rescheduleService(
  client: SupabaseClient<Database> = db(),
  requestHost?: string | null,
): RescheduleService {
  return new RescheduleService(
    new MercadoPagoGateway(requireEnv("MP_ACCESS_TOKEN")),
    pricingService(client),
    new SupabaseRescheduleRepository(client),
    new SupabaseWebhookRepository(client),
    paymentService(client, requestHost),
  );
}

/** Barre cobros de reagendamiento diferidos abandonados (>72 h sin pagar). */
export async function expireAbandonedReschedules(client: SupabaseClient<Database> = db()): Promise<number> {
  const { data } = await client.rpc("expire_abandoned_reschedules");
  return data ?? 0;
}

/** Barre reservas manuales pendientes abandonadas (hold firme, >72 h sin pagar). */
export async function expireAbandonedManualHolds(client: SupabaseClient<Database> = db()): Promise<number> {
  const { data, error } = await client.rpc("expire_abandoned_manual_holds_ids");
  if (error) throw new Error(error.message);
  const ids = data ?? [];
  // El cliente recibió "Tu hora está tomada — falta el pago" y luego nada: avisarle
  // que el horario se liberó (best-effort; la orden ya quedó cancelada igual).
  for (const id of ids) {
    await notificationService(client)
      .notifyHoldExpired(id)
      .catch((e) => console.error("[reconcile:manual-holds:email]", id, e));
  }
  return ids.length;
}

/** Barre inscripciones de curso abandonadas (>72 h sin pagar) y libera sus cupos. */
export async function expireAbandonedCourseHolds(client: SupabaseClient<Database> = db()): Promise<number> {
  const { data } = await client.rpc("expire_abandoned_course_holds");
  return data ?? 0;
}

/** Mapea una orden de delta → orden original + monto del delta (para el aviso del webhook). */
export async function rescheduleNotifyInfo(
  deltaOrderId: string,
  client: SupabaseClient<Database> = db(),
): Promise<{ originalOrderId: string; delta: number } | null> {
  const { data } = await client
    .from("reschedules")
    .select("original_order_id, delta_clp")
    .eq("delta_order_id", deltaOrderId)
    .maybeSingle();
  // original_order_id es null solo en movimientos de cortesía (sin orden), que
  // nunca tienen delta_order_id — pero el tipo lo exige.
  return data?.original_order_id ? { originalOrderId: data.original_order_id, delta: data.delta_clp } : null;
}

/** Cuenta del cliente: perfil, puntos (retro incluido) y reservas por email verificado. */
export function customerService(client: SupabaseClient<Database> = db()): CustomerService {
  return new CustomerService(new SupabaseCustomerRepository(client));
}

/**
 * Directorio de clientes para el admin: buscar, crear y resolver una ficha por
 * id. Separado de `customerService` a propósito: ese resuelve siempre por la
 * sesión del titular y nunca acepta un id de afuera.
 */
export function customerDirectory(client: SupabaseClient<Database> = db()): CustomerDirectoryService {
  return new CustomerDirectoryService(new SupabaseCustomerRepository(client));
}

/**
 * PIN de la cerradura: genera los que faltan y manda los que están por empezar
 * (y ya cargados en la Yale). Lo dispara pg_cron cada 5 min vía /api/cron/access-codes.
 */
export function accessCodeService(client: SupabaseClient<Database> = db()): AccessCodeService {
  return new AccessCodeService(new SupabaseAdminRepository(client), notificationService(client));
}

/** Recordatorio de sesión (hasta 24 h antes): mismo cron de 5 min que el PIN, mismo patrón de reclamo. */
export function reminderService(client: SupabaseClient<Database> = db()): ReminderService {
  return new ReminderService(new SupabaseReminderRepository(client), notificationService(client));
}

/**
 * Libera los puntos canjeados en checkouts abandonados (>72 h pending_payment).
 * Corre en el cron de reconcile DESPUÉS de reconcilePending (que aún puede
 * confirmar alguno). Un pago tardío posterior se auto-repara en confirm_payment.
 */
export async function releaseAbandonedRedemptions(client: SupabaseClient<Database> = db()): Promise<number> {
  const { data, error } = await client.rpc("release_abandoned_redemptions", {});
  if (error) throw new Error(error.message);
  return data ?? 0;
}

/** RBAC: gestión de miembros y roles del admin (invitación nativa de Supabase). */
export function memberService(
  client: SupabaseClient<Database> = db(),
  requestHost?: string | null,
): MemberService {
  return new MemberService(
    new SupabaseMemberRepository(client),
    new SupabaseInviter(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY")),
    { siteUrl: resolveSiteUrl(requestHost) },
  );
}

/** Feature flag: el flujo de reserva nace apagado en producción. */
export const bookingEnabled = (): boolean => process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
