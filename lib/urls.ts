const CANONICAL = "https://www.fotfstudios.cl";

/**
 * ¿Es `host` un destino de redirect que controlamos? Se valida SOLO el host que
 * viene de la request (influenciable por el cliente vía `Host`/`x-forwarded-host`)
 * antes de volverlo `back_url` de MP o `redirectTo` de invitación — así un header
 * falsificado solo puede apuntar a un host nuestro (no hay open-redirect). Fija
 * proyecto + team (no el `*.vercel.app` abierto), igual que la allow-list de
 * Redirect URLs de Supabase.
 */
export function isAllowedBackUrlHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === "www.fotfstudios.cl" || h === "fotfstudios.cl") return true;
  return h.startsWith("fotfstudios-website-") && h.endsWith("-fotf-studios.vercel.app");
}

/** Host de la request: prefiere `x-forwarded-host` (proxy de Vercel) sobre `host`. */
export function hostFromHeaders(h: { get(name: string): string | null }): string | null {
  return h.get("x-forwarded-host") ?? h.get("host");
}

/**
 * URL base para los redirect que arma el **servidor** (back_urls de Mercado Pago,
 * enlaces de invitación de admin). Va aparte de `SITE_URL` (canónico para SEO) y
 * de `resolveAuthOrigin` (cliente) a propósito.
 *
 * Precedencia:
 *   0. En **producción** (`VERCEL_ENV`) → dominio canónico. Best-effort: fija prod
 *      a `www` aunque la request llegue por un alias `*.vercel.app` del deployment
 *      de prod (mismo shape que un preview). Si `VERCEL_ENV` falta no rompe: prod
 *      igual resuelve a `www` por el host de la request (que llega por `www`).
 *   1. El **host de la request** (el deployment donde el comprador/admin está), si
 *      es un host nuestro (`isAllowedBackUrlHost`). Cubre preview y prod sin
 *      depender de `VERCEL_URL`.
 *   2. `NEXT_PUBLIC_SITE_URL` — escape hatch: túnel de pago local / override.
 *   3. Dominio canónico de producción.
 *
 * Local y prod quedan idénticos a antes (los hosts locales nunca están en la
 * allow-list, así que caen a `NEXT_PUBLIC_SITE_URL`/canónico); solo cambia preview,
 * que pasa de romper (caía a `www`) a devolver su propio host.
 */
export function resolveSiteUrl(requestHost?: string | null): string {
  if (process.env.VERCEL_ENV === "production") return CANONICAL;
  if (requestHost && isAllowedBackUrlHost(requestHost)) return `https://${requestHost.toLowerCase()}`;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return CANONICAL;
}
