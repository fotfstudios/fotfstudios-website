/**
 * Contrato de variables de entorno — fuente única.
 *
 * **Público vs secreto.** Las `NEXT_PUBLIC_*` se incrustan en el bundle del
 * cliente al hacer `build` (visibles para cualquiera): solo valores no secretos.
 * El resto se lee solo en el servidor (en runtime) y NUNCA debe llevar el prefijo
 * `NEXT_PUBLIC_`.
 *
 *   Públicas:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *              NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BOOKING_ENABLED
 *   Secretas:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN,
 *              MP_WEBHOOK_SECRET, RESEND_API_KEY, CRON_SECRET, EMAIL_FROM, OWNER_EMAIL
 *
 * **Requeridas vs condicionales.** `BASE_REQUIRED` son las que la app necesita en
 * todo entorno; se validan de una sola vez al arrancar (`assertBaseEnv`, llamada
 * desde `instrumentation.ts`) para fallar temprano con un mensaje claro en vez de a
 * mitad de un request. Las condicionales (Mercado Pago, Resend, cron) se exigen en
 * su punto de uso con `requireEnv`, respetando la degradación elegante (p. ej. sin
 * `RESEND_API_KEY` se usa el NoopMailer) y el feature flag de reservas.
 */

/** Lee una variable requerida; lanza un error claro si falta o está vacía. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno requerida: ${name}`);
  return v;
}

/** Variables sin las cuales la app no puede funcionar en ningún entorno. */
export const BASE_REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/**
 * Valida el set base de una sola vez. Devuelve la lista de faltantes (vacía si OK)
 * para que el caller decida cómo reportar. Puro: no lee más que `process.env`.
 */
export function missingBaseEnv(): string[] {
  return BASE_REQUIRED.filter((name) => !process.env[name]);
}

/** Lanza un error agregado si falta alguna variable base. Llamado al arrancar. */
export function assertBaseEnv(): void {
  const missing = missingBaseEnv();
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(", ")}. ` +
        "Configúralas en .env.local (local) o en Vercel (Preview/Production).",
    );
  }
}
