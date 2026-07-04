/**
 * Destino post-login del callback de auth. Puro y testeable: el `next` que viaja
 * en el magic link es input del atacante, así que solo se aceptan rutas internas
 * de una allow-list explícita (anti open-redirect).
 */

const NEXT_ALLOWED = ["/cuenta", "/admin", "/reservar"] as const;

/** Devuelve `raw` solo si es una ruta interna permitida; null si no. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  const path = raw.split(/[?#]/)[0];
  const ok = NEXT_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? raw : null;
}

/** Respeta `next` salvo /admin sin rol admin; sin next, default por rol. */
export function resolveDestination(next: string | null, isAdmin: boolean): string {
  const n = safeNext(next);
  if (n && (isAdmin || !n.startsWith("/admin"))) return n;
  return isAdmin ? "/admin" : "/cuenta";
}

/** Login al que volver si el intercambio de código falla, según el flujo de origen. */
export function failureLoginPath(next: string | null): "/cuenta/login" | "/admin/login" {
  const n = safeNext(next);
  if (n && (n.startsWith("/cuenta") || n.startsWith("/reservar"))) return "/cuenta/login";
  return "/admin/login";
}
