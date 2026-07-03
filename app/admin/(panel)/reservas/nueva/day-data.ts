import { adminRepository, availabilityService } from "@/src/composition";
import { dayBoundsUtc, toLocalMinutesInterval } from "@/src/domain/scheduling/time";
import type { DayConsoleData } from "./types";

/**
 * Datos del día para la consola de reserva manual: disponibilidad (horario +
 * huecos) y ocupación con nombres, en una sola pasada. Lo usan la página (primer
 * render) y getDayConsoleAction (cambio de fecha).
 */
export async function loadDayConsole(resourceId: string, tz: string, date: string): Promise<DayConsoleData> {
  const { startUtc, endUtc } = dayBoundsUtc(date, tz);
  const [avail, bookings] = await Promise.all([
    availabilityService().getDayAvailability(resourceId, date),
    adminRepository().bookingsBetween(startUtc, endUtc),
  ]);
  if (!avail.ok) throw new Error("No se pudo cargar la disponibilidad.");
  return {
    avail: avail.value,
    occupancy: bookings.map((b) => ({
      id: b.id,
      ...toLocalMinutesInterval(date, tz, b.startsAt, b.endsAt),
      name: b.customerName,
      kind: b.kind,
      status: b.status,
    })),
  };
}
