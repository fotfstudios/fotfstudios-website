export interface ResourceCalendar {
  timezone: string;
  openingHours: Record<number, [number, number]>; // weekday (0..6) → [open, close] en minutos
}

export interface BookedRange {
  startsAt: string; // ISO UTC
  endsAt: string;
}

export interface SchedulingRepository {
  getResourceCalendar(resourceId: string): Promise<ResourceCalendar | null>;
  getReservationsForDate(resourceId: string, startUtc: string, endUtc: string): Promise<BookedRange[]>;
}
