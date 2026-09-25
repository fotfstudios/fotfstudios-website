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

/**
 * ¿Está abierto el Curso de DJ al público? Constante en código (no env) a propósito:
 * es una decisión de negocio que se revisa en PR, no un toggle por entorno.
 *
 * En `false`: /curso-dj muestra una página de pausa (misma URL, sin precios ni
 * formulario), el home/nav/footer y los artículos dejan de ofrecerlo y
 * POST /api/curso/solicitudes responde 410. Siguen vivos /curso-dj/pago, /cuenta/curso
 * y el admin: los alumnos ya inscritos los necesitan.
 */
export const CURSO_ABIERTO = false;
