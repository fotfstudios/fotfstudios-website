import { describe, expect, it } from "vitest";
import { MANUAL_HOLD_HOURS, MANUAL_HOLD_SWEEP_UTC, manualHoldFreesAt } from "./manual-hold-deadline";

describe("manualHoldFreesAt", () => {
  it("primer barrido diario después de las 72 h", () => {
    // lunes 11:00 CL (14:00 UTC) + 72 h = jueves 14:00 UTC → el barrido de las 12:30 UTC ya pasó → viernes
    const created = "2026-10-05T14:00:00Z";
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-09T12:30:00.000Z");
  });

  it("si las 72 h caen antes del barrido de ese día, libera ese mismo día", () => {
    const created = "2026-10-05T03:00:00Z"; // + 72 h = jueves 03:00 UTC
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-08T12:30:00.000Z");
  });

  it("72 h exactas sobre un barrido → el del día siguiente (el SQL compara con <, estricto)", () => {
    const created = "2026-10-05T12:30:00Z";
    expect(manualHoldFreesAt(created, new Date(created)).toISOString()).toBe("2026-10-09T12:30:00.000Z");
  });

  it("si ya pasó el plazo (cron caído), nombra el próximo barrido, nunca uno pasado", () => {
    const created = "2026-10-01T14:00:00Z";
    const now = new Date("2026-10-08T15:00:00Z");
    expect(manualHoldFreesAt(created, now).toISOString()).toBe("2026-10-09T12:30:00.000Z");
  });

  it("acepta Date además de ISO", () => {
    const created = new Date("2026-10-05T14:00:00Z");
    expect(manualHoldFreesAt(created, created).toISOString()).toBe("2026-10-09T12:30:00.000Z");
  });

  it("constantes = default del SQL y cron de reconcile", () => {
    expect(MANUAL_HOLD_HOURS).toBe(72);
    expect(MANUAL_HOLD_SWEEP_UTC).toEqual({ hour: 12, minute: 30 });
  });
});
