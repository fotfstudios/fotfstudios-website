import { DateTime } from "luxon";

const TZ = "America/Santiago";

/**
 * Fecha futura (YYYY-MM-DD) en el `weekday` pedido (Luxon: 1=lun … 7=dom), al menos
 * `weeksAhead` semanas adelante. Los tests de integración reservan contra esta fecha
 * para satisfacer el lead-time mínimo (`MIN_LEAD_MINUTES`) y el filtro de slots
 * pasados — sin acoplarse a una fecha fija. Como las tarifas y horarios del seed son
 * por weekday (no por fecha), cualquier lunes futuro rinde igual que un lunes fijo.
 */
export function futureDate(weekday = 1, weeksAhead = 2): string {
  let d = DateTime.now().setZone(TZ).startOf("day").plus({ weeks: weeksAhead });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.toISODate()!;
}
