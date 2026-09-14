import { describe, expect, it } from "vitest";
import { effectiveReservationStatus } from "./hold-expiry";

const NOW = new Date("2026-09-13T21:09:00-03:00");

describe("effectiveReservationStatus", () => {
  it("un held cuyo expires_at ya pasó es expired aunque la columna diga held", () => {
    expect(effectiveReservationStatus("held", "2026-09-13T21:08:46-03:00", NOW)).toBe("expired");
  });
  it("un held vigente sigue held", () => {
    expect(effectiveReservationStatus("held", "2026-09-13T21:10:00-03:00", NOW)).toBe("held");
  });
  it("hold firme (expires_at null) nunca vence por tiempo", () => {
    expect(effectiveReservationStatus("held", null, NOW)).toBe("held");
  });
  it("los demás estados pasan tal cual", () => {
    expect(effectiveReservationStatus("confirmed", "2026-09-13T20:00:00-03:00", NOW)).toBe("confirmed");
    expect(effectiveReservationStatus("cancelled", null, NOW)).toBe("cancelled");
    expect(effectiveReservationStatus("expired", null, NOW)).toBe("expired");
  });
});
