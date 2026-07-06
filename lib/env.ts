/**
 * Contrato de variables de entorno — fuente única.
 *
 * **Público vs secreto.** Las `NEXT_PUBLIC_*` se incrustan en el bundle del
 * cliente al hacer `build` (visibles para cualquiera): solo valores no secretos.
 * El resto se lee solo en el servidor (en runtime) y NUNCA debe llevar el prefijo
 * `NEXT_PUBLIC_`.
 *
 *   Públicas:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *              NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BOOKING_ENABLED,
 *              NEXT_PUBLIC_MP_PUBLIC_KEY (public key de MP, no secreta por diseño;
 *              sin ella el Wallet Brick degrada al botón clásico con redirect)
 *   Secretas:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN,
 *              MP_WEBHOOK_SECRET, RESEND_API_KEY, CRON_SECRET, EMAIL_FROM, OWNER_EMAIL
 *   Opcional (solo dev): MP_NOTIFICATION_URL — notification_url por-preference
 *              (túnel alternativo); vacía en prod para que MP notifique vía los
 *              Webhooks del panel (firma validable).
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

/**
 * Variables condicionales que, si faltan en **producción**, degradan la app en
 * silencio y sin señal al arrancar: crons `401` (sin `CRON_SECRET`), correos
 * al vacío vía NoopMailer (sin `RESEND_API_KEY`/`EMAIL_FROM`/`OWNER_EMAIL`), y
 * pagos deshabilitados (sin las de Mercado Pago). No son fatales —la degradación
 * es válida en algunos entornos— así que solo avisamos, no lanzamos.
 */
export const PROD_RECOMMENDED = [
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_SECRET",
  "NEXT_PUBLIC_MP_PUBLIC_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OWNER_EMAIL",
  "CRON_SECRET",
] as const;

/** Faltantes del set recomendado de prod (vacío si están todas). Puro. */
export function missingProdEnv(): string[] {
  return PROD_RECOMMENDED.filter((name) => !process.env[name]);
}

/**
 * Avisa (no lanza) si faltan variables recomendadas, para que una degradación
 * silenciosa —sin correos, crons `401`, pagos off— sea visible en los logs de
 * arranque en vez de descubrirse en producción. Las base siguen siendo fatales
 * vía `assertBaseEnv`. Pensada para llamarse solo en el entorno de producción.
 */
export function warnMissingProdEnv(): void {
  const missing = missingProdEnv();
  if (missing.length > 0) {
    console.warn(
      `[env] Producción sin variables recomendadas: ${missing.join(", ")}. ` +
        "Las funciones asociadas degradarán en silencio (correos, crons, pagos). " +
        "Configúralas en Vercel si corresponde.",
    );
  }
}
