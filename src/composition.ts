/**
 * Composition root — ensambla servicios de aplicación con adaptadores concretos
 * (Supabase, Mercado Pago). Único lugar que conoce ambas capas; `app/` (rutas)
 * importa desde aquí. Lee la config de entorno de forma perezosa (en request).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE } from "@/lib/site";
import { SupabaseAdminRepository } from "@/src/infrastructure/db/admin-repository";
import { AvailabilityService } from "@/src/application/availability/availability-service";
import { NotificationService } from "@/src/application/notifications/notification-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PaymentService } from "@/src/application/payment/payment-service";
import { WebhookService, type WebhookResult } from "@/src/application/payment/webhook-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseWebhookRepository } from "@/src/infrastructure/db/webhook-repository";
import type { Mailer } from "@/src/application/ports/mailer";
import { SupabaseCheckoutRepository } from "@/src/infrastructure/db/checkout-repository";
import type { Database } from "@/src/infrastructure/db/database.types";
import { SupabaseNotificationRepository } from "@/src/infrastructure/db/notification-repository";
import { SupabaseOrderRepository } from "@/src/infrastructure/db/order-repository";
import { SupabaseRatePlanRepository } from "@/src/infrastructure/db/rate-plan-repository";
import { SupabaseSchedulingRepository } from "@/src/infrastructure/db/scheduling-repository";
import { serviceClientFromEnv } from "@/src/infrastructure/db/supabase-client";
import { ResendMailer, NoopMailer } from "@/src/infrastructure/email/resend-mailer";
import { MercadoPagoGateway } from "@/src/infrastructure/payments/mercadopago/mercadopago-gateway";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno: ${name}`);
  return v;
}

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

export function checkoutService(client: SupabaseClient<Database> = db()): CheckoutService {
  return new CheckoutService(
    new PricingService(new SupabaseRatePlanRepository(client)),
    new SupabaseCheckoutRepository(client),
  );
}

export function paymentService(client: SupabaseClient<Database> = db()): PaymentService {
  return new PaymentService(
    new MercadoPagoGateway(requireEnv("MP_ACCESS_TOKEN")),
    new SupabaseOrderRepository(client),
    { siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://fotfstudios.cl" },
  );
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
  const service = new WebhookService(gateway, new SupabaseWebhookRepository(client));
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
): Promise<{ scanned: number; paid: number; unreserved: number }> {
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
  return { scanned: ids.length, paid, unreserved };
}

export function mailer(): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "FOTF Studios <reservas@fotfstudios.cl>";
  return key ? new ResendMailer(key, from) : new NoopMailer();
}

export function notificationService(client: SupabaseClient<Database> = db()): NotificationService {
  return new NotificationService(mailer(), new SupabaseNotificationRepository(client), {
    ownerEmail: process.env.OWNER_EMAIL ?? "",
    tz: "America/Santiago",
    address: SITE.address,
    whatsappUrl: `https://wa.me/${SITE.whatsapp}`,
  });
}

export function adminRepository(client: SupabaseClient<Database> = db()): SupabaseAdminRepository {
  return new SupabaseAdminRepository(client);
}

/** Feature flag: el flujo de reserva nace apagado en producción. */
export const bookingEnabled = (): boolean => process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
