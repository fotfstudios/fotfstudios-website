import { describe, expect, it } from "vitest";
import { classifyDay, monthGrid } from "./month-availability";
import { monthBoundsUtc, monthDates } from "./time";

describe("classifyDay", () => {
  it("closed cuando no hay horario (cierre <= apertura)", () => {
    expect(classifyDay(540, 540, [])).toBe("closed");
    expect(classifyDay(720, 540, [])).toBe("closed");
  });
  it("open con 3+ inicios libres", () => {
    expect(classifyDay(540, 720, [])).toBe("open"); // 9–12 → 9,10,11
  });
  it("low con 1–2 inicios libres", () => {
    expect(classifyDay(540, 660, [])).toBe("low"); // 9–11 → 9,10
    expect(classifyDay(540, 720, [{ start: 540, end: 660 }])).toBe("low"); // queda 11
  });
  it("full con 0 inicios libres", () => {
    expect(classifyDay(540, 720, [{ start: 540, end: 720 }])).toBe("full");
  });
});

describe("monthGrid", () => {
  it("6 semanas de 7 días, empezando en lunes, con relleno de meses vecinos", () => {
    const g = monthGrid("2026-06"); // 1 jun 2026 = lunes
    expect(g).toHaveLength(6);
    expect(g.flat()).toHaveLength(42);
    expect(g[0][0]).toEqual({ date: "2026-06-01", inMonth: true }); // lunes = primer día
    expect(g[0][1]).toEqual({ date: "2026-06-02", inMonth: true });
    expect(g.flat()[30]).toEqual({ date: "2026-07-01", inMonth: false }); // relleno mes siguiente
  });
});

describe("monthDates", () => {
  it("lista todas las fechas del mes", () => {
    expect(monthDates("2026-06")).toHaveLength(30);
    expect(monthDates("2024-02")).toHaveLength(29); // bisiesto
    expect(monthDates("2026-06")[0]).toBe("2026-06-01");
  });
});

describe("monthBoundsUtc", () => {
  it("límites UTC del mes local (junio = -04 en Santiago)", () => {
    expect(monthBoundsUtc("2026-06", "America/Santiago")).toEqual({
      startUtc: "2026-06-01T04:00:00.000Z",
      endUtc: "2026-07-01T04:00:00.000Z",
    });
  });
});
