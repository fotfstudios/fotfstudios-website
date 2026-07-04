/** Validación pura del formulario de perfil del cliente (en lib/ para vitest). */

const PHONE_RE = /^[+0-9 ()-]{6,20}$/;

export function validateProfile(input: { name: string; phone: string }): {
  name: string | null;
  phone: string | null;
} {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (name.length > 80) throw new Error("El nombre no puede superar los 80 caracteres.");
  if (phone && !PHONE_RE.test(phone)) throw new Error("Teléfono no válido. Usa dígitos, +, espacios o guiones.");
  return { name: name || null, phone: phone || null };
}
