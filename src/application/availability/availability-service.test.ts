import { describe, expect, it } from "vitest";
import type { BookedRange, ResourceCalendar, SchedulingRepository } from "@/src/application/ports/scheduling";
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
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

describe("AvailabilityService.getRangeAvailability", () => {
  // Lunes 1 jun 2026 10:05 en Santiago (-04).
  const NOW = new Date("2026-06-01T14:05:00.000Z");

  it("error si el recurso no existe", async () => {
    const svc = new AvailabilityService(fakeRepo(null, []));
    expect((await svc.getRangeAvailability("x", "2026-06-01", 3, NOW)).ok).toBe(false);
  });

  it("un día por fecha con horario, ocupación y corte de hoy", async () => {
    const reservations: BookedRange[] = [
      // 2 jun 10:00–11:00 local = 14:00–15:00Z
      { startsAt: "2026-06-02T14:00:00.000Z", endsAt: "2026-06-02T15:00:00.000Z" },
    ];
    const svc = new AvailabilityService(fakeRepo(CAL, reservations));
    const r = await svc.getRangeAvailability("res", "2026-05-31", 3, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.from).toBe("2026-05-31");
    expect(r.value.days.map((d) => d.date)).toEqual(["2026-05-31", "2026-06-01", "2026-06-02"]);
    const [past, today, tomorrow] = r.value.days;
    expect(past).toMatchObject({ weekday: 0, closed: true, minStart: 1440 }); // domingo y ya pasó
    expect(today).toMatchObject({ closed: false, openMinute: 540, closeMinute: 720, booked: [], minStart: 605 + MIN_LEAD_MINUTES });
    expect(tomorrow).toMatchObject({ booked: [{ start: 600, end: 660 }], minStart: 0 });
  });

  it("no pasa del horizonte de reservas", async () => {
    const svc = new AvailabilityService(fakeRepo(CAL, []));
    const r = await svc.getRangeAvailability("res", "2026-08-28", 10, NOW);
    if (!r.ok) throw new Error(r.error);
    // Horizonte 90 días: de 2026-06-01 a 2026-08-29 inclusive.
    expect(r.value.days.map((d) => d.date)).toEqual(["2026-08-28", "2026-08-29"]);
    const beyond = await svc.getRangeAvailability("res", "2026-09-01", 5, NOW);
    expect(beyond.ok && beyond.value.days).toEqual([]);
  });
});

describe("AvailabilityService.checkOnlineSlot (checkout público)", () => {
  // Lunes 1 jun 2026 10:05 en Santiago (-04). CAL: Lun–Sáb 09:00–12:00, domingo cerrado.
  const NOW = new Date("2026-06-01T14:05:00.000Z");
  const svc = (reservations: BookedRange[] = []) => new AvailabilityService(fakeRepo(CAL, reservations));
  const check = (s: AvailabilityService, date: string, start: number, hours = 1) =>
    s.checkOnlineSlot("res", date, start, hours, NOW);

  it("acepta exactamente un inicio que ofrece la grilla", async () => {
    expect(await check(svc(), "2026-06-02", 600)).toEqual({ ok: true, value: true });
    expect(await check(svc(), "2026-06-02", 540, 3)).toEqual({ ok: true, value: true });
  });

  it("fuera de horario, cerrado o desalineado → outside_hours", async () => {
    expect(await check(svc(), "2026-06-02", 180)).toEqual({ ok: false, error: "outside_hours" }); // 03:00
    expect(await check(svc(), "2026-06-02", 660, 2)).toEqual({ ok: false, error: "outside_hours" }); // pasa el cierre
    expect(await check(svc(), "2026-06-02", 630)).toEqual({ ok: false, error: "outside_hours" }); // 10:30
    expect(await check(svc(), "2026-06-02", 600.5)).toEqual({ ok: false, error: "outside_hours" });
    expect(await check(svc(), "2026-06-07", 600)).toEqual({ ok: false, error: "outside_hours" }); // domingo
  });

  it("hoy antes del corte de anticipación, o un día pasado → too_soon", async () => {
    expect(await check(svc(), "2026-06-01", 600)).toEqual({ ok: false, error: "too_soon" });
    expect(await check(svc(), "2026-05-30", 600)).toEqual({ ok: false, error: "too_soon" });
  });

  it("más allá del horizonte → too_far", async () => {
    expect(await check(svc(), "2026-08-29", 600)).toEqual({ ok: true, value: true }); // último día
    expect(await check(svc(), "2026-08-31", 600)).toEqual({ ok: false, error: "too_far" });
  });

  it("ocupado → slot_taken", async () => {
    // 2 jun 10:00–11:00 local = 14:00–15:00Z
    const taken = svc([{ startsAt: "2026-06-02T14:00:00.000Z", endsAt: "2026-06-02T15:00:00.000Z" }]);
    expect(await check(taken, "2026-06-02", 600)).toEqual({ ok: false, error: "slot_taken" });
    expect(await check(taken, "2026-06-02", 540, 2)).toEqual({ ok: false, error: "slot_taken" });
  });

  it("recurso inexistente → outside_hours (nunca un error crudo)", async () => {
    const none = new AvailabilityService(fakeRepo(null, []));
    expect(await none.checkOnlineSlot("x", "2026-06-02", 600, 1, NOW)).toEqual({ ok: false, error: "outside_hours" });
  });
});
