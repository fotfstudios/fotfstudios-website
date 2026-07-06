/**
 * Resolución de la URL base para los redirect que arma el **servidor** (back_urls
 * de Mercado Pago, enlaces de invitación de admin). Va aparte de `SITE_URL`
 * (canónico para SEO) y de `resolveAuthOrigin` (cliente) a propósito.
 *
 * Precedencia:
 *   1. `NEXT_PUBLIC_SITE_URL` explícita — local (túnel de pago) y prod.
 *   2. En un deployment de **preview** de Vercel, su propia URL (`VERCEL_URL`),
 *      para que el comprador/admin vuelva al mismo preview y canjee contra staging.
 *   3. El dominio canónico de producción.
 *
 * Local y prod quedan idénticos a antes; solo cambia el comportamiento en preview
 * (donde `VERCEL_ENV === "preview"` y normalmente no hay `NEXT_PUBLIC_SITE_URL`).
 * `VERCEL_ENV`/`VERCEL_URL` existen en runtime del servidor en Vercel; en local
 * están ausentes, así que cae a la rama (1) o (3).
 */
export function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://www.fotfstudios.cl";
}
