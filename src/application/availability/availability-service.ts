import type { BookedRange, ResourceCalendar, SchedulingRepository } from "@/src/application/ports/scheduling";
import {
  addDays,
  dayBoundsUtc,
  monthBoundsUtc,
  monthDates,
  nowMinuteInTz,
  todayInTz,
  toLocalMinutesInterval,
  weekdayFor,
} from "@/src/domain/scheduling/time";
import { classifyDay, type DayStatus } from "@/src/domain/scheduling/month-availability";
import { BOOKING_HORIZON_DAYS, MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
import { err, ok, type Result } from "@/src/domain/shared/result";

export interface DayAvailability {
  date: string;
  weekday: number;
  openMinute: number;
  closeMinute: number;
  closed: boolean;
  booked: { start: number; end: number }[]; // minutos locales ocupados
}

/** Un día del rango: lo de `DayAvailability` + el corte de inicios (hoy/pasado). */
export interface RangeDay extends DayAvailability {
  /** Ningún inicio antes de este minuto: hoy = ahora + anticipación; días pasados = 1440. */
  minStart: number;
}

export interface RangeAvailability {
  from: string;
  days: RangeDay[];
}

export interface MonthAvailability {
  month: string;
  days: Record<string, DayStatus>;
}

/** Horario y ocupación de `date`, a partir de reservas que pueden cubrir más días. */
function dayOf(cal: ResourceCalendar, date: string, reservations: BookedRange[]): DayAvailability {
  const weekday = weekdayFor(date, cal.timezone);
  const hours = cal.openingHours[weekday];
  if (!hours) return { date, weekday, openMinute: 0, closeMinute: 0, closed: true, booked: [] };
  const { startUtc, endUtc } = dayBoundsUtc(date, cal.timezone);
  const booked = reservations
    .filter((r) => r.startsAt < endUtc && r.endsAt > startUtc)
    .map((r) => toLocalMinutesInterval(date, cal.timezone, r.startsAt, r.endsAt));
  return { date, weekday, openMinute: hours[0], closeMinute: hours[1], closed: false, booked };
}

/** Disponibilidad de un día: horario del recurso menos lo ya reservado. */
export class AvailabilityService {
  constructor(private readonly repo: SchedulingRepository) {}

  async getDayAvailability(resourceId: string, date: string): Promise<Result<DayAvailability, string>> {
    const cal = await this.repo.getResourceCalendar(resourceId);
    if (!cal) return err("recurso no encontrado");
    if (!cal.openingHours[weekdayFor(date, cal.timezone)]) return ok(dayOf(cal, date, []));

    const { startUtc, endUtc } = dayBoundsUtc(date, cal.timezone);
    const reservations = await this.repo.getReservationsForDate(resourceId, startUtc, endUtc);
    return ok(dayOf(cal, date, reservations));
  }

  /**
   * `days` días desde `from` (incluido), recortado al horizonte de reservas en línea.
   * Una sola consulta a la DB para todo el rango; el cliente deriva inicios por
   * duración (`day-starts.ts`) sin volver a pedir.
   */
  async getRangeAvailability(
    resourceId: string,
    from: string,
    days: number,
    now: Date = new Date(),
  ): Promise<Result<RangeAvailability, string>> {
    const cal = await this.repo.getResourceCalendar(resourceId);
    if (!cal) return err("recurso no encontrado");

    const today = todayInTz(cal.timezone, now);
    const lastBookable = addDays(today, BOOKING_HORIZON_DAYS - 1);
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d) => d <= lastBookable);
    if (dates.length === 0) return ok({ from, days: [] });

    const startUtc = dayBoundsUtc(dates[0], cal.timezone).startUtc;
    const endUtc = dayBoundsUtc(dates[dates.length - 1], cal.timezone).endUtc;
    const reservations = await this.repo.getReservationsForDate(resourceId, startUtc, endUtc);
    const nowMin = nowMinuteInTz(cal.timezone, now);

    return ok({
      from,
      days: dates.map((date) => ({
        ...dayOf(cal, date, reservations),
        minStart: date < today ? 1440 : date === today ? nowMin + MIN_LEAD_MINUTES : 0,
      })),
    });
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
      const day = dayOf(cal, date, reservations);
      if (day.closed) {
        days[date] = "closed";
        continue;
      }
      // Hoy: descarta los horarios cuya hora ya pasó, para no pintar "open" un día
      // sin cupos restantes (el calendario lo deja inseleccionable → salta de mes).
      const minStart = date === today ? nowMin + MIN_LEAD_MINUTES : 0;
      days[date] = classifyDay(day.openMinute, day.closeMinute, day.booked, minStart);
    }
    return ok({ month, days });
  }
}
