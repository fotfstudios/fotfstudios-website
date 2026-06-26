import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookedRange,
  ResourceCalendar,
  SchedulingRepository,
} from "@/src/application/ports/scheduling";
import type { Database } from "./database.types";

export class SupabaseSchedulingRepository implements SchedulingRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getResourceCalendar(resourceId: string): Promise<ResourceCalendar | null> {
    const { data: resource } = await this.db
      .from("resources")
      .select("location_id")
      .eq("id", resourceId)
      .single();
    if (!resource) return null;

    const { data: location } = await this.db
      .from("locations")
      .select("timezone")
      .eq("id", resource.location_id)
      .single();

    const { data: oh } = await this.db
      .from("opening_hours")
      .select("weekday, open_minute, close_minute")
      .eq("resource_id", resourceId);

    const openingHours: Record<number, [number, number]> = {};
    for (const row of oh ?? []) openingHours[row.weekday] = [row.open_minute, row.close_minute];

    return { timezone: location?.timezone ?? "America/Santiago", openingHours };
  }

  async getReservationsForDate(
    resourceId: string,
    startUtc: string,
    endUtc: string,
  ): Promise<BookedRange[]> {
    const { data } = await this.db
      .from("reservations")
      .select("starts_at, ends_at")
      .eq("resource_id", resourceId)
      .in("status", ["held", "confirmed"])
      .lt("starts_at", endUtc)
      .gt("ends_at", startUtc);
    return (data ?? []).map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
  }
}
