import { describe, expect, it } from "vitest";
import { dowLabel, monthRangeLabel, startCountsByDuration, stripCell, validStarts, type StartDay } from "./day-starts";

// 09:00–13:00, ocupado 10:00–11:00.
const DAY: StartDay = { date: "2026-10-13", weekday: 2, closed: false, openMinute: 540, closeMinute: 780, booked: [{ start: 600, end: 660 }], minStart: 0 };
const CLOSED: StartDay = { date: "2026-10-11", weekday: 0, closed: true, openMinute: 0, closeMinute: 0, booked: [], minStart: 0 };

describe("validStarts", () => {
  it("inicios en la hora que caben sin chocar", () => {
    expect(validStarts(DAY, 1)).toEqual([540, 660, 720]);
    expect(validStarts(DAY, 2)).toEqual([660]);
    expect(validStarts(DAY, 3)).toEqual([]);
  });

  it("respeta minStart (hoy) y los días cerrados", () => {
    expect(validStarts({ ...DAY, minStart: 700 }, 1)).toEqual([720]);
    expect(validStarts(CLOSED, 1)).toEqual([]);
  });
});

describe("startCountsByDuration", () => {
  it("cuenta inicios para 1–4 h por defecto", () => {
    expect(startCountsByDuration(DAY)).toEqual({ 1: 3, 2: 1, 3: 0, 4: 0 });
  });
});

describe("stripCell", () => {
  it("HOY en la fecha de hoy, DOW en el resto; 'N hrs' con acento si quedan ≤3", () => {
    expect(stripCell(DAY, 1, "2026-10-13")).toMatchObject({ dow: "HOY", num: "13", free: 3, label: "3 hrs", low: true, disabled: false });
    expect(stripCell(DAY, 1, "2026-10-12")).toMatchObject({ dow: "MAR" });
  });

  it("LLENO sin inicios para la duración; CERRADO si el local no abre", () => {
    expect(stripCell(DAY, 3, "2026-10-12")).toMatchObject({ label: "LLENO", disabled: true, low: false });
    expect(stripCell(CLOSED, 1, "2026-10-10")).toMatchObject({ label: "CERRADO", disabled: true, dow: "DOM" });
  });

  it("no marca acento con más de 3 inicios", () => {
    const wide = { ...DAY, closeMinute: 1080, booked: [] };
    expect(stripCell(wide, 1, "2026-10-12")).toMatchObject({ free: 9, low: false });
  });
});

describe("etiquetas", () => {
  it("dowLabel en mayúsculas con tilde", () => {
    expect([0, 3, 6].map(dowLabel)).toEqual(["DOM", "MIÉ", "SÁB"]);
  });

  it("monthRangeLabel colapsa mes y año iguales", () => {
    expect(monthRangeLabel("2026-10-11", "2026-10-24")).toBe("OCT 2026");
    expect(monthRangeLabel("2026-10-25", "2026-11-07")).toBe("OCT — NOV 2026");
    expect(monthRangeLabel("2026-12-25", "2027-01-07")).toBe("DIC 2026 — ENE 2027");
  });
});
