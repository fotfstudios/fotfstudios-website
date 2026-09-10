/**
 * Contacto — único hogar de la normalización de email y teléfono del dominio.
 * Puro, sin IO. `EMAIL_RE` y el tope de 120 son el ESPEJO exacto del gate SQL de
 * `upsert_guest_customer` / `update_customer_contact` / el backfill
 * (`20260909120000_customer_directory.sql`): si divergen, la app aceptaría datos
 * que la DB rechaza (23514/`customer_email_invalid`) o al revés.
 */

/** Forma de email aceptada. Espejo de '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' en SQL. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Tope de largo del email (mismo que el gate SQL y la columna). */
export const EMAIL_MAX = 120;

/** trim + minúsculas + forma + tope; null si no pasa (nunca lanza). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Solo los dígitos (sin `+`), o null si no queda ninguno. Espejo de `phone_digits`. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || null;
}

/**
 * Canoniza a `"+"(opcional) + dígitos`. Chile primero: quita el 00 internacional;
 * 9 dígitos que parten en 9 y 11 que parten en 56 → `+56…` (la forma que
 * `normalizePhoneCl`/`waLink` aceptan); el resto pasa si cae en 8–15 dígitos.
 * null si no. Máximo 16 caracteres → siempre cabe en customers_phone_len (6–40).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const s = raw ?? "";
  // "+" internacional si aparece antes del primer dígito (tolera "(+56)").
  const plus = /^[^\d]*\+/.test(s);
  let digits = s.replace(/\D/g, "");
  // El 00 es prefijo internacional, pero se saca SOLO si lo que queda sigue
  // siendo un teléfono (8–15 dígitos): "00123456" es un número válido de 8
  // dígitos que /unete y /curso-dj ya aceptan, y sacarle el 00 lo volvería null.
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    if (rest.length >= 8 && rest.length <= 15) digits = rest;
  }
  if (digits.length === 9 && digits.startsWith("9")) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return `+${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

/**
 * Dígitos internacionales (sin `+`) de un teléfono chileno, o null si no se
 * reconoce: "+56 9 6280 3298" → "56962803298"; "962803298" → "56962803298".
 * `lib/whatsapp.ts` lo re-exporta (waLink lo usa).
 */
export function normalizePhoneCl(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("56")) return digits;
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  return null;
}
