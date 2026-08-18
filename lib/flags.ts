/**
 * Feature flags públicos (NEXT_PUBLIC_* se inlinean en build). Importable desde
 * server, client y middleware — sin dependencias de composición.
 */

/** Área de clientes /cuenta + puntos (mismo patrón que NEXT_PUBLIC_BOOKING_ENABLED). */
export function accountEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNT_ENABLED === "true";
}

/**
 * ¿Está habilitada la reserva en línea? Cuando está apagado, los CTA caen a
 * WhatsApp (sin 404). Vive acá (y no en BookingCta) para que los server
 * components puedan importarlo sin cruzar el límite "use client".
 */
export function bookingOnline(): boolean {
  return process.env.NEXT_PUBLIC_BOOKING_ENABLED === "true";
}
