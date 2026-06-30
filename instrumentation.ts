import { assertBaseEnv, missingBaseEnv } from "@/lib/env";

/**
 * Hook de arranque de Next.js: valida las variables de entorno base de una sola
 * vez al iniciar el servidor, para fallar temprano y con un mensaje claro si falta
 * configuración (en vez de romper a mitad de un request).
 *
 * Excepción: en **Vercel Preview** las variables de Supabase no están configuradas
 * (no hay base de datos de preview), así que ahí solo avisamos —no lanzamos— para no
 * tumbar rutas dinámicas que ni siquiera usan la DB (p. ej. la imagen OG). En
 * producción y en local sí exigimos el set base.
 */
export function register() {
  if (process.env.VERCEL_ENV === "preview") {
    const missing = missingBaseEnv();
    if (missing.length > 0) {
      console.warn(`[env] Preview sin variables base: ${missing.join(", ")} — las rutas que usan la DB no funcionarán.`);
    }
    return;
  }
  assertBaseEnv();
}
