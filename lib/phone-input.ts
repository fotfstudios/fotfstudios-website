/**
 * Celular chileno del formulario de reserva: solo los 9 dígitos locales en el
 * input (la caja "+56" es fija), formateados "9 1234 5678" al teclear y tolerando
 * que se pegue "+56 9 …". La validación es la misma del canal de WhatsApp
 * (`chileanMobile`), así cliente y servidor aceptan exactamente lo mismo.
 */
import { chileanMobile } from "@/src/domain/contact/whatsapp-recipient";

const LOCAL_LEN = 9;

/** Dígitos locales (máx. 9) desde lo tecleado o pegado, sin prefijo de país. */
export function clMobileDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Solo se saca el 56 cuando claramente es el prefijo (viene un número completo detrás).
  if (d.length > LOCAL_LEN && d.startsWith("56")) d = d.slice(2);
  return d.slice(0, LOCAL_LEN);
}

/** "9 1234 5678" progresivo para el valor del input. */
export function formatClMobile(digits: string): string {
  if (digits.length <= 1) return digits;
  if (digits.length <= 5) return `${digits[0]} ${digits.slice(1)}`;
  return `${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5)}`;
}

export function isValidClMobile(raw: string): boolean {
  return chileanMobile(clMobileDigits(raw)) !== null;
}

/** "+569XXXXXXXX" (como se guarda en la ficha y el pedido) o null. */
export function toE164ClMobile(raw: string): string | null {
  const wa = chileanMobile(clMobileDigits(raw));
  return wa ? `+${wa}` : null;
}
