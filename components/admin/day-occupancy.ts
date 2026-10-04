/**
 * Ocupación real de la sala en un día: horario de apertura + todo lo agendado
 * (reservas, bloqueos, sesiones de curso, prácticas) con nombre y tipo, en minutos
 * locales. Una sola fuente para todo selector de horario del admin: la consola de
 * reserva manual, el reagendamiento y las sesiones/práctica del curso.
 * Server-only (lee la DB); los componentes cliente la reciben vía una server action.
 */
import type { DayAvailability } from "@/src/application/availability/availability-service";
import { adminRepository, availabilityService } from "@/src/composition";
import { dayBoundsUtc, toLocalMinutesInterval } from "@/src/domain/scheduling/time";

/** Reserva/bloqueo existente del día, en minutos locales (para la cinta y la lista). */
export interface OccupancyEntry {
  id: string;
  start: number;
  end: number;
  name: string | null;
  kind: string;
  status: string;
}

/** Datos del día: horario + huecos anónimos + ocupación con nombres. */
export interface DayConsoleData {
  avail: DayAvailability;
  occupancy: OccupancyEntry[];
}

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
