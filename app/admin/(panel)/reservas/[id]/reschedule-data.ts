import { loadDayConsole } from "../nueva/day-data";
import type { DayConsoleData } from "../nueva/types";

/**
 * Día para el picker de reagendamiento: como la consola de reserva manual, pero
 * SACA de la ocupación la reserva que se está moviendo, para que su propio slot
 * actual aparezca libre (el GiST en la DB es el respaldo real al confirmar).
 */
export async function getRescheduleDay(
  resourceId: string,
  tz: string,
  date: string,
  excludeReservationId: string,
): Promise<DayConsoleData> {
  const day = await loadDayConsole(resourceId, tz, date);
  return { ...day, occupancy: day.occupancy.filter((o) => o.id !== excludeReservationId) };
}
