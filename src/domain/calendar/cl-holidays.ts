/**
 * Feriados nacionales de Chile (fecha local YYYY-MM-DD). Un feriado se cobra
 * como domingo: tarifa punta finde todo el día (ver PricingService.quoteBooking).
 *
 * Lista estática a propósito: los feriados "movibles" (San Pedro y San Pablo,
 * Encuentro de Dos Mundos, Iglesias Evangélicas) y los que se agregan por ley
 * no salen de una fórmula confiable. Al publicarse el calendario del año
 * siguiente, agregar sus fechas aquí. Feriados regionales no aplican (Viña).
 */
export const CL_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // Año Nuevo
  "2026-04-03", // Viernes Santo
  "2026-04-04", // Sábado Santo
  "2026-05-01", // Día del Trabajo
  "2026-05-21", // Glorias Navales
  "2026-06-21", // Pueblos Indígenas (solsticio)
  "2026-06-29", // San Pedro y San Pablo
  "2026-07-16", // Virgen del Carmen
  "2026-08-15", // Asunción de la Virgen
  "2026-09-18", // Independencia
  "2026-09-19", // Glorias del Ejército
  "2026-10-12", // Encuentro de Dos Mundos
  "2026-10-31", // Iglesias Evangélicas
  "2026-11-01", // Todos los Santos
  "2026-12-08", // Inmaculada Concepción
  "2026-12-25", // Navidad
  // 2027 — revisar contra el calendario oficial (¿17-sep puente?)
  "2027-01-01", // Año Nuevo
  "2027-03-26", // Viernes Santo
  "2027-03-27", // Sábado Santo
  "2027-05-01", // Día del Trabajo
  "2027-05-21", // Glorias Navales
  "2027-06-21", // Pueblos Indígenas (solsticio)
  "2027-06-28", // San Pedro y San Pablo (trasladado a lunes)
  "2027-07-16", // Virgen del Carmen
  "2027-08-15", // Asunción de la Virgen
  "2027-09-18", // Independencia
  "2027-09-19", // Glorias del Ejército
  "2027-10-11", // Encuentro de Dos Mundos (trasladado a lunes)
  "2027-10-31", // Iglesias Evangélicas
  "2027-11-01", // Todos los Santos
  "2027-12-08", // Inmaculada Concepción
  "2027-12-25", // Navidad
]);

export function isChileanHoliday(date: string): boolean {
  return CL_HOLIDAYS.has(date);
}
