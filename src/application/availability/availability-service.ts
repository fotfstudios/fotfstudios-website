import type { SchedulingRepository } from "@/src/application/ports/scheduling";
import { dayBoundsUtc, toLocalMinutesInterval, weekdayFor } from "@/src/domain/scheduling/time";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface DayAvailability {
  date: string;
  weekday: number;
  openMinute: number;
  closeMinute: number;
  closed: boolean;
  booked: { start: number; end: number }[]; // minutos locales ocupados
}

/** Disponibilidad de un día: horario del recurso menos lo ya reservado. */
export class AvailabilityService {
  constructor(private readonly repo: SchedulingRepository) {}

  async getDayAvailability(resourceId: string, date: string): Promise<Result<DayAvailability, string>> {
    const cal = await this.repo.getResourceCalendar(resourceId);
    if (!cal) return err("recurso no encontrado");

    const weekday = weekdayFor(date, cal.timezone);
    const hours = cal.openingHours[weekday];
    if (!hours) return ok({ date, weekday, openMinute: 0, closeMinute: 0, closed: true, booked: [] });

    const { startUtc, endUtc } = dayBoundsUtc(date, cal.timezone);
    const reservations = await this.repo.getReservationsForDate(resourceId, startUtc, endUtc);
    const booked = reservations.map((r) =>
      toLocalMinutesInterval(date, cal.timezone, r.startsAt, r.endsAt),
    );

    return ok({ date, weekday, openMinute: hours[0], closeMinute: hours[1], closed: false, booked });
  }
}
