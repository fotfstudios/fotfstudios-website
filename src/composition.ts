/**
 * Composition root — ensambla servicios de aplicación con adaptadores concretos
 * (Supabase, Mercado Pago). Único lugar que conoce ambas capas; `app/` (rutas)
 * importa desde aquí. Lee la config de entorno de forma perezosa (en request).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AvailabilityService } from "@/src/application/availability/availability-service";
import { CheckoutService } from "@/src/application/checkout/checkout-service";
import { PaymentService } from "@/src/application/payment/payment-service";
import { PricingService } from "@/src/application/pricing/pricing-service";
import { SupabaseCheckoutRepository } from "@/src/infrastructure/db/checkout-repository";
import type { Database } from "@/src/infrastructure/db/database.types";
import { SupabaseOrderRepository } from "@/src/infrastructure/db/order-repository";
import { SupabaseRatePlanRepository } from "@/src/infrastructure/db/rate-plan-repository";
import { SupabaseSchedulingRepository } from "@/src/infrastructure/db/scheduling-repository";
import { serviceClientFromEnv } from "@/src/infrastructure/db/supabase-client";
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

/** Feature flag: el flujo de reserva nace apagado en producción. */
export const bookingEnabled = (): boolean => process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
