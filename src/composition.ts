/**
 * Composition root — el ÚNICO lugar que ensambla servicios de aplicación con
 * adaptadores de infraestructura concretos (Mercado Pago, Supabase, Resend, SII).
 * `app/` (route handlers, server actions) importa los casos de uso desde aquí,
 * nunca instancia adaptadores por su cuenta. Se irá llenando PR a PR.
 */
export const composition = {} as const;
