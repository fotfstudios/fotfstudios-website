import { describe, expect, it } from "vitest";
import type { BookedRange, ResourceCalendar, SchedulingRepository } from "@/src/application/ports/scheduling";
import { AvailabilityService } from "./availability-service";

function fakeRepo(cal: ResourceCalendar | null, reservations: BookedRange[]): SchedulingRepository {
  return {
    async getResourceCalendar() {
      return cal;
    },
    async getReservationsForDate() {
      return reservations; // el servicio filtra por día; el fake devuelve todo
    },
  };
}

// Lun–Sáb 09:00–12:00 (3 cupos de 1h); domingo cerrado (sin clave 0).
const CAL: ResourceCalendar = {
  timezone: "America/Santiago",
  openingHours: { 1: [540, 720], 2: [540, 720], 3: [540, 720], 4: [540, 720], 5: [540, 720], 6: [540, 720] },
};

describe("AvailabilityService.getMonthAvailability", () => {
  it("error si el recurso no existe", async () => {
    const svc = new AvailabilityService(fakeRepo(null, []));
    const r = await svc.getMonthAvailability("x", "2026-06");
    expect(r.ok).toBe(false);
  });

  it("clasifica closed/full/low/open por día", async () => {
    const reservations: BookedRange[] = [
      // 2 jun (mar) 09:00–12:00 local (-04) = 13:00–16:00Z → full
      { startsAt: "2026-06-02T13:00:00.000Z", endsAt: "2026-06-02T16:00:00.000Z" },
      // 3 jun (mié) 09:00–11:00 local = 13:00–15:00Z → queda 11:00 → low
      { startsAt: "2026-06-03T13:00:00.000Z", endsAt: "2026-06-03T15:00:00.000Z" },
    ];
    const svc = new AvailabilityService(fakeRepo(CAL, reservations));
    const r = await svc.getMonthAvailability("res", "2026-06");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.days["2026-06-07"]).toBe("closed"); // domingo
    expect(r.value.days["2026-06-02"]).toBe("full");
    expect(r.value.days["2026-06-03"]).toBe("low");
    expect(r.value.days["2026-06-04"]).toBe("open"); // jueves sin reservas
  });
});
