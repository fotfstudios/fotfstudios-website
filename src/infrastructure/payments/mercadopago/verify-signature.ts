import { InvalidWebhookSignatureError, SignatureFailureReason, WebhookSignatureValidator } from "mercadopago";

export { SignatureFailureReason };

/** Ventana anti-replay: MP firma con `ts` en segundos; más viejo que esto, se rechaza. */
export const MP_SIGNATURE_TOLERANCE_SECONDS = 300;

type SignatureOpts = {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
  secret: string;
  toleranceSeconds?: number;
  /** Reloj inyectable para tests. */
  now?: () => number;
};

/**
 * Verifica la firma (x-signature) de un webhook de Mercado Pago delegando en el
 * validador oficial del SDK (`WebhookSignatureValidator`), que implementa la
 * verificación HMAC-SHA256 según la spec (manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, con `data.id` en minúsculas
 * y omitiendo segmentos ausentes) y la ventana anti-replay sobre `ts`.
 *
 * Devuelve `null` si la firma valida, o el motivo del fallo para loguearlo junto
 * al `x-request-id` (así se cruza con el historial de notificaciones del panel).
 * No lanza.
 */
export function mpSignatureFailure(opts: SignatureOpts): SignatureFailureReason | "MissingSecret" | "Unknown" | null {
  const { xSignature, xRequestId, dataId, secret, now } = opts;
  if (!secret) return "MissingSecret";

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId,
      secret,
      toleranceSeconds: opts.toleranceSeconds ?? MP_SIGNATURE_TOLERANCE_SECONDS,
      now,
    });
    return null;
  } catch (e) {
    return e instanceof InvalidWebhookSignatureError ? e.reason : "Unknown";
  }
}

/**
 * Contrato **booleano y sin excepciones** sobre `mpSignatureFailure`. Es defensa en
 * profundidad: el webhook NO se descarta si la firma no valida — la fuente de
 * verdad es la consulta a la API de MP (ver route.ts).
 */
export function verifyMpSignature(opts: SignatureOpts): boolean {
  return mpSignatureFailure(opts) === null;
}
