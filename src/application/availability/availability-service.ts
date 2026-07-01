import type { SchedulingRepository } from "@/src/application/ports/scheduling";
import {
  dayBoundsUtc,
  monthBoundsUtc,
  monthDates,
  nowMinuteInTz,
  todayInTz,
  toLocalMinutesInterval,
  weekdayFor,
} from "@/src/domain/scheduling/time";
import { classifyDay, type DayStatus } from "@/src/domain/scheduling/month-availability";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface DayAvailability {
  date: string;
  weekday: number;
  openMinute: number;
  closeMinute: number;
  closed: boolean;
  booked: { start: number; end: number }[]; // minutos locales ocupados
}

export interface MonthAvailability {
  month: string;
  days: Record<string, DayStatus>;
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

  /** Estado por día del mes "YYYY-MM" para pintar el calendario (granularidad 1h). */
  async getMonthAvailability(resourceId: string, month: string): Promise<Result<MonthAvailability, string>> {
    const cal = await this.repo.getResourceCalendar(resourceId);
    if (!cal) return err("recurso no encontrado");

    const { startUtc, endUtc } = monthBoundsUtc(month, cal.timezone);
    const reservations = await this.repo.getReservationsForDate(resourceId, startUtc, endUtc);

    const today = todayInTz(cal.timezone);
    const nowMin = nowMinuteInTz(cal.timezone);

    const days: Record<string, DayStatus> = {};
    for (const date of monthDates(month)) {
      const hours = cal.openingHours[weekdayFor(date, cal.timezone)];
      if (!hours) {
        days[date] = "closed";
        continue;
      }
      const { startUtc: ds, endUtc: de } = dayBoundsUtc(date, cal.timezone);
      const booked = reservations
        .filter((r) => r.startsAt < de && r.endsAt > ds)
        .map((r) => toLocalMinutesInterval(date, cal.timezone, r.startsAt, r.endsAt));
      // Hoy: descarta los horarios cuya hora ya pasó, para no pintar "open" un día
      // sin cupos restantes (el calendario lo deja inseleccionable → salta de mes).
      const minStart = date === today ? nowMin : 0;
      days[date] = classifyDay(hours[0], hours[1], booked, minStart);
    }
    return ok({ month, days });
  }
}
