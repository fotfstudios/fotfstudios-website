import { describe, expect, it } from "vitest";
import { availableStartMinutes, overlaps } from "./availability";

describe("overlaps", () => {
  it("semiabierto: adyacentes no chocan", () => {
    expect(overlaps({ start: 540, end: 600 }, { start: 600, end: 660 })).toBe(false);
    expect(overlaps({ start: 540, end: 601 }, { start: 600, end: 660 })).toBe(true);
  });
});

describe("availableStartMinutes", () => {
  it("lista inicios en la hora exacta dentro del horario", () => {
    // 09:00–12:00, 1h → 09:00, 10:00, 11:00
    expect(availableStartMinutes(540, 720, 1, [])).toEqual([540, 600, 660]);
  });

  it("excluye inicios que se traslapan con lo reservado", () => {
    // 09:00–12:00, 1h, reservado 10:00–11:00 → quedan 09:00 y 11:00
    expect(availableStartMinutes(540, 720, 1, [{ start: 600, end: 660 }])).toEqual([540, 660]);
  });

  it("respeta la duración contra el cierre", () => {
    // 09:00–12:00, 2h → 09:00, 10:00 (11:00+2h pasaría del cierre)
    expect(availableStartMinutes(540, 720, 2, [])).toEqual([540, 600]);
  });

  it("excluye inicios anteriores al corte (hoy: hora actual)", () => {
    // 09:00–12:00, 1h, corte 10:30 → 09:00 y 10:00 ya pasaron, queda 11:00
    expect(availableStartMinutes(540, 720, 1, [], 60, 630)).toEqual([660]);
  });

  it("sin corte por defecto lista desde la apertura", () => {
    // minStartMinute por defecto no recorta nada
    expect(availableStartMinutes(540, 720, 1, [])).toEqual([540, 600, 660]);
  });
});
