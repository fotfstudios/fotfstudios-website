/** Validación pura del formulario de perfil del cliente (en lib/ para vitest). */
import { normalizePhone } from "@/src/domain/contact/contact";

// El perfil guarda el teléfono TAL COMO se tipeó (con espacios/paréntesis), a
// diferencia de parseCustomerInput que canoniza. Este allow-list conserva esa
// semántica permisiva y su ventana 6–20 garantiza el CHECK customers_phone_len
// (6–40) cuando /cuenta/perfil pasa por update_customer_contact.
const PHONE_CHARS_RE = /^[+0-9 ()-]{6,20}$/;

export function validateProfile(input: { name: string; phone: string }): {
  name: string | null;
  phone: string | null;
} {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (name.length > 80) throw new Error("El nombre no puede superar los 80 caracteres.");
  // Los caracteres los decide el allow-list; el rango de dígitos (8–15), el
  // helper compartido: así "((((((" o "+1 (2) 3" dejan de pasar.
  if (phone && (!PHONE_CHARS_RE.test(phone) || !normalizePhone(phone))) {
    throw new Error("Teléfono no válido. Usa dígitos, +, espacios o guiones.");
  }
  return { name: name || null, phone: phone || null };
}
