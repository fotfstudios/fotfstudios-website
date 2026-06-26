import crypto from "node:crypto";

/**
 * Verifica la firma del webhook de Mercado Pago.
 * MP envía `x-signature: ts=<ts>,v1=<hmac>` y `x-request-id`. El manifiesto
 * firmado es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con HMAC-SHA256
 * usando el secreto del webhook.
 */
export function verifyMpSignature(opts: {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId: string;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;
  if (!xSignature || !secret) return false;

  const parts: Record<string, string> = {};
  for (const seg of xSignature.split(",")) {
    const [k, v] = seg.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}
