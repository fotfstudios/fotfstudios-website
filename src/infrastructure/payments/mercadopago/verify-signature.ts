import crypto from "node:crypto";

/**
 * Verifica la firma del webhook de Mercado Pago según la especificación oficial.
 *
 * MP envía `x-signature: ts=<ts>,v1=<hmac>` y `x-request-id`. El manifiesto firmado es
 *   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * donde:
 *  - `data.id` es el valor del **query param `data.id`** (en minúscula si es alfanumérico);
 *  - si `data.id` o `x-request-id` **no están presentes, se OMITE ese segmento**;
 *  - el HMAC es SHA-256 en hex usando la clave secreta del webhook.
 *
 * Ref: developers.mercadopago / Checkout Pro → notificaciones → validar origen.
 */
export function verifyMpSignature(opts: {
  xSignature?: string | null;
  xRequestId?: string | null;
  /** El `data.id` tomado de los QUERY params de la URL (no del body). */
  dataId?: string | null;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;
  if (!xSignature || !secret) return false;

  const parts: Record<string, string> = {};
  for (const seg of xSignature.split(",")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // Manifiesto: omitir segmentos cuyo valor no esté presente (regla de la spec).
  const segments: string[] = [];
  if (dataId) segments.push(`id:${dataId.toLowerCase()};`);
  if (xRequestId) segments.push(`request-id:${xRequestId};`);
  segments.push(`ts:${ts};`);
  const manifest = segments.join("");

  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}
