import { describe, expect, it } from "vitest";
import { fmtHours, fmtTimeRange } from "./format";

describe("fmtHours", () => {
  it("horas enteras sin decimales", () => {
    expect(fmtHours(2)).toBe("2h");
  });

  it("media hora con coma decimal (es-CL)", () => {
    expect(fmtHours(1.5)).toBe("1,5h");
  });
});

describe("fmtTimeRange", () => {
  it("un bloque de 90 minutos se lee 1,5 h", () => {
    expect(fmtTimeRange("2026-10-08T19:00:00Z", "2026-10-08T20:30:00Z")).toBe("16:00–17:30 · 1,5 h");
  });
});
