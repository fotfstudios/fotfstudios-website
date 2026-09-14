/**
 * ¿Se carga GTM/GA4? Solo en producción: localhost, túneles (ngrok) y previews de Vercel
 * no son tráfico real y contaminaban la propiedad de GA4 (auditoría 2026-09-13, H9).
 * `NEXT_PUBLIC_GTM_FORCE=true` en .env.local permite verificar un tag nuevo a propósito.
 */
export function measurementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.NEXT_PUBLIC_GTM_FORCE === "true";
}
