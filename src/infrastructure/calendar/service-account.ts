/**
 * Lee `GOOGLE_SERVICE_ACCOUNT_JSON`: el JSON de la llave tal cual lo descarga Google, o ese
 * mismo JSON en base64 (lo recomendado en Vercel: el dashboard no rompe comillas ni saltos).
 * Ausente = la función está apagada (sin error); mal formado = error para mostrar en el admin.
 */
export type ServiceAccount =
  | { ok: true; clientEmail: string; privateKey: string }
  | { ok: false; error: string | null };

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  const value = raw?.trim();
  if (!value) return { ok: false, error: null };
  let json: unknown;
  try {
    json = JSON.parse(value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON no es JSON ni base64 de un JSON." };
  }
  const o = json as { client_email?: unknown; private_key?: unknown };
  if (typeof o.client_email !== "string" || typeof o.private_key !== "string") {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON no trae client_email y private_key (¿es la llave de una cuenta de servicio?)." };
  }
  return { ok: true, clientEmail: o.client_email, privateKey: o.private_key };
}
