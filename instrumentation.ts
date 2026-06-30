import { assertBaseEnv } from "@/lib/env";

/**
 * Hook de arranque de Next.js: valida las variables de entorno base de una sola
 * vez al iniciar el servidor, para fallar temprano y con un mensaje claro si falta
 * configuración (en vez de romper a mitad de un request).
 */
export function register() {
  assertBaseEnv();
}
