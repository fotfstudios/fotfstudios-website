import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { dayBoundsUtc, instantFor, rangeFor, toLocalMinutesInterval, weekdayFor } from "./time";

const SCL = "America/Santiago";

describe("weekdayFor", () => {
  it("mapea a 0=Dom … 6=Sáb", () => {
    expect(weekdayFor("2024-01-01", SCL)).toBe(1); // lunes
    expect(weekdayFor("2024-01-06", SCL)).toBe(6); // sábado
    expect(weekdayFor("2024-01-07", SCL)).toBe(0); // domingo
  });
});

describe("rangeFor / instantFor (DST Chile)", () => {
  it("verano = UTC-3 (enero): 18:00 local → 21:00Z", () => {
    const { startsAt, endsAt } = rangeFor("2024-01-15", 1080, 1, SCL);
    expect(DateTime.fromISO(startsAt).toUTC().hour).toBe(21);
    expect(DateTime.fromISO(endsAt).diff(DateTime.fromISO(startsAt), "hours").hours).toBe(1);
  });

  it("invierno = UTC-4 (julio): 18:00 local → 22:00Z", () => {
    const { startsAt } = rangeFor("2024-07-15", 1080, 1, SCL);
    expect(DateTime.fromISO(startsAt).toUTC().hour).toBe(22);
  });

  it("instantFor coincide con el inicio del rango", () => {
    expect(instantFor("2024-07-15", 1080, SCL)).toBe(rangeFor("2024-07-15", 1080, 1, SCL).startsAt);
  });
});

describe("dayBoundsUtc / toLocalMinutesInterval", () => {
  it("los límites del día abarcan 24h", () => {
    const { startUtc, endUtc } = dayBoundsUtc("2024-07-15", SCL);
    expect(DateTime.fromISO(endUtc).diff(DateTime.fromISO(startUtc), "hours").hours).toBe(24);
  });

  it("mapea un rango UTC a minutos locales del día", () => {
    // reserva 18:00–19:00 local del 2024-07-15
    const { startsAt, endsAt } = rangeFor("2024-07-15", 1080, 1, SCL);
    expect(toLocalMinutesInterval("2024-07-15", SCL, startsAt, endsAt)).toEqual({ start: 1080, end: 1140 });
  });
});
