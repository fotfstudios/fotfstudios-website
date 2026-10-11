/**
 * Nombre y celular que un cliente con sesión edita desde /reservar ("Editar" → "Guardar").
 * Más estricto que el perfil de /cuenta (que acepta cualquier teléfono): el checkout exige
 * celular chileno, y lo guardado es lo que la reserva toma de la ficha.
 */
import { toE164ClMobile } from "./phone-input";

export function validateBookingContact(input: { name: string; phone: string }): { name: string; phone: string | null } {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe tu nombre.");
  if (name.length > 80) throw new Error("El nombre no puede superar los 80 caracteres.");
  if (!input.phone.trim()) return { name, phone: null };
  const phone = toE164ClMobile(input.phone);
  if (!phone) throw new Error("Ingresa un celular chileno válido: 9 1234 5678.");
  return { name, phone };
}
