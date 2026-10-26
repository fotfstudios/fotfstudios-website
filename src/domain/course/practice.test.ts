import { describe, expect, it } from "vitest";
import { isPracticeHours, practiceDurations, practiceHoursLabel } from "./practice";

describe("isPracticeHours", () => {
  it.each([1, 1.5, 2, 6])("acepta %s", (h) => expect(isPracticeHours(h)).toBe(true));
  it.each([0, 0.5, 1.25, 1.75, -1, NaN, Infinity])("rechaza %s", (h) => expect(isPracticeHours(h)).toBe(false));
});

describe("practiceDurations", () => {
  it("de 1 h al máximo en medias horas", () => {
    expect(practiceDurations(3)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(practiceDurations(2.5)).toEqual([1, 1.5, 2, 2.5]);
  });
  it("con menos de 1 h disponible no hay opciones", () => {
    expect(practiceDurations(0.5)).toEqual([]);
    expect(practiceDurations(0)).toEqual([]);
  });
});

describe("practiceHoursLabel", () => {
  it("formatea en es-CL", () => {
    expect(practiceHoursLabel(1)).toBe("1 hora");
    expect(practiceHoursLabel(1.5)).toBe("1,5 horas");
    expect(practiceHoursLabel(2)).toBe("2 horas");
    expect(practiceHoursLabel(0.5)).toBe("0,5 horas");
  });
});
