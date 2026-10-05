import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de los webhooks de Kapso: `X-Webhook-Signature` = HMAC-SHA256 en hex del body CRUDO con el
 * secreto que configuramos en Kapso (`KAPSO_WEBHOOK_SECRET`). Se verifica contra los bytes tal como
 * llegaron: re-serializar un JSON parseado cambia el orden de claves o los escapes y la firma no
 * calza. A diferencia de Mercado Pago (donde la verdad es la API), acá la firma ES la verdad: una
 * firma inválida se rechaza. Acepta un prefijo `sha256=` por si el proveedor lo agrega.
 */
export function verifyKapsoSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return timingSafeEqual(Buffer.from(given, "hex"), expected);
}
