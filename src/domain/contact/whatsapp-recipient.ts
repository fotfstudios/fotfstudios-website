import { normalizePhoneCl } from "./contact";

/**
 * Celular chileno en el formato que espera WhatsApp (`569XXXXXXXX`) o null. Un fijo (`56 2 …`),
 * un número extranjero o un teléfono mal tipeado no reciben WhatsApp: en v1 el canal es solo para
 * celulares chilenos, y el correo sigue siendo el aviso garantizado.
 */
export function chileanMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizePhoneCl(raw);
  return digits && /^569\d{8}$/.test(digits) ? digits : null;
}

/**
 * Destinatario de un aviso al CLIENTE: solo con consentimiento registrado Y celular chileno.
 * Es la única puerta: ningún `notify*` manda WhatsApp a un cliente sin pasar por acá.
 */
export function waRecipient(c: { phone: string | null | undefined; whatsappOptIn: boolean | null | undefined }): string | null {
  return c.whatsappOptIn === true ? chileanMobile(c.phone) : null;
}

/**
 * Número del dueño (`OWNER_WHATSAPP`) en dígitos, o null si falta o es inválido. No puede ser la
 * línea del estudio: un número de WhatsApp Business no se puede escribir a sí mismo, y el aviso se
 * perdería en silencio.
 */
export function parseOwnerWhatsapp(raw: string | null | undefined, businessLine: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith("9")) digits = `56${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits === businessLine.replace(/\D/g, "") ? null : digits;
}
