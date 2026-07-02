import { WebhookSignatureValidator } from "mercadopago";

/**
 * Verifica la firma (x-signature) de un webhook de Mercado Pago delegando en el
 * validador oficial del SDK (`WebhookSignatureValidator`), que implementa la
 * verificación HMAC-SHA256 según la spec (manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, con `data.id` en minúsculas
 * y omitiendo segmentos ausentes).
 *
 * Mantiene un contrato **booleano y sin excepciones**: el SDK lanza
 * `InvalidWebhookSignatureError` ante cualquier fallo, y aquí lo traducimos a
 * `false`. Es defensa en profundidad: el webhook NO se descarta si la firma no
 * valida — la fuente de verdad es la consulta a la API de MP (ver route.ts).
 *
 * Nota: no se activa `toleranceSeconds` (ventana anti-replay) porque el chequeo
 * del SDK compara `Date.now()` (ms) contra `ts` tratado como ms, pero MP envía
 * `ts` en segundos; habilitarlo rechazaría toda notificación válida.
 */
export function verifyMpSignature(opts: {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;
  if (!xSignature || !secret) return false;

  try {
    WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret });
    return true;
  } catch {
    // InvalidWebhookSignatureError (u otro error) → firma no válida.
    return false;
  }
}
