import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { planSessions, selfOverlap } from "./sessions";

const TZ = "America/Santiago";
const TITULOS = ["Sonido y primera transición", "Beatmatching manual", "Armado de set", "Set final grabado"];

/** Hora de pared local en la que realmente cae un instante UTC. */
const wallTime = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toFormat("HH:mm");
const wallDate = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toISODate();

describe("planSessions — grilla semanal", () => {
  it("numera desde 1 y respeta los títulos", () => {
    const plan = planSessions({
      firstDate: "2026-10-06", startMinute: 20 * 60, durationHours: 2, titles: TITULOS, tz: TZ,
    });
    expect(plan.map((p) => p.n)).toEqual([1, 2, 3, 4]);
    expect(plan.map((p) => p.title)).toEqual(TITULOS);
  });

  it("cada sesión cae 7 días después de la anterior, mismo día de semana", () => {
    const plan = planSessions({
      firstDate: "2026-10-06", startMinute: 20 * 60, durationHours: 2, titles: TITULOS, tz: TZ,
    });
    expect(plan.map((p) => wallDate(p.startsAt))).toEqual([
      "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27",
    ]);
  });

  it("la duración se respeta", () => {
    const [s] = planSessions({
      firstDate: "2026-10-06", startMinute: 20 * 60, durationHours: 2, titles: ["A"], tz: TZ,
    });
    expect(wallTime(s.startsAt)).toBe("20:00");
    expect(wallTime(s.endsAt)).toBe("22:00");
  });

  it("everyWeeks separa las sesiones (quincenal)", () => {
    const plan = planSessions({
      firstDate: "2026-10-06", startMinute: 20 * 60, durationHours: 2,
      titles: ["A", "B"], everyWeeks: 2, tz: TZ,
    });
    expect(wallDate(plan[1].startsAt)).toBe("2026-10-20");
  });
});

// El bug más caro que puede tener este módulo: sumar 7×24 h en UTC corre media
// generación una hora cuando cruza el cambio de horario chileno. El alumno llega
// a las 20:00 y la sala no es suya.
describe("planSessions — cambio de hora chileno", () => {
  it("primavera: cruzar el paso a −03 mantiene las 20:00 en las cuatro sesiones", () => {
    // Chile adelanta el primer domingo de septiembre de 2026 (6 de septiembre).
    const plan = planSessions({
      firstDate: "2026-08-25", startMinute: 20 * 60, durationHours: 2, titles: TITULOS, tz: TZ,
    });
    expect(plan.map((p) => wallTime(p.startsAt))).toEqual(["20:00", "20:00", "20:00", "20:00"]);
    expect(plan.map((p) => wallTime(p.endsAt))).toEqual(["22:00", "22:00", "22:00", "22:00"]);

    // Y el offset UTC efectivamente cambió a mitad de la generación: sin eso el
    // test pasaría por no estar cruzando nada.
    const offsets = plan.map((p) => DateTime.fromISO(p.startsAt).setZone(TZ).offset);
    expect(new Set(offsets).size).toBe(2);
  });

  it("otoño: cruzar el paso a −04 también mantiene la hora de pared", () => {
    // Chile atrasa el primer domingo de abril de 2026 (5 de abril).
    const plan = planSessions({
      firstDate: "2026-03-17", startMinute: 20 * 60, durationHours: 2, titles: TITULOS, tz: TZ,
    });
    expect(plan.map((p) => wallTime(p.startsAt))).toEqual(["20:00", "20:00", "20:00", "20:00"]);
    const offsets = plan.map((p) => DateTime.fromISO(p.startsAt).setZone(TZ).offset);
    expect(new Set(offsets).size).toBe(2);
  });

  it("una fecha inválida se rechaza antes de tocar la DB", () => {
    expect(() =>
      planSessions({ firstDate: "no-es-fecha", startMinute: 0, durationHours: 2, titles: ["A"], tz: TZ }),
    ).toThrow(/curso_bad_date/);
  });
});

describe("selfOverlap — el plan no puede pisarse a sí mismo", () => {
  it("una grilla semanal normal no se solapa", () => {
    const plan = planSessions({
      firstDate: "2026-10-06", startMinute: 20 * 60, durationHours: 2, titles: TITULOS, tz: TZ,
    });
    expect(selfOverlap(plan)).toBeNull();
  });

  it("dos sesiones el mismo día a la misma hora se detectan", () => {
    const plan = [
      { n: 1, title: "A", startsAt: "2026-10-06T23:00:00.000Z", endsAt: "2026-10-07T01:00:00.000Z" },
      { n: 2, title: "B", startsAt: "2026-10-07T00:00:00.000Z", endsAt: "2026-10-07T02:00:00.000Z" },
    ];
    expect(selfOverlap(plan)?.n).toBe(2);
  });

  it("sesiones adyacentes (fin == inicio) NO se consideran solape", () => {
    const plan = [
      { n: 1, title: "A", startsAt: "2026-10-06T23:00:00.000Z", endsAt: "2026-10-07T01:00:00.000Z" },
      { n: 2, title: "B", startsAt: "2026-10-07T01:00:00.000Z", endsAt: "2026-10-07T03:00:00.000Z" },
    ];
    expect(selfOverlap(plan)).toBeNull();
  });
});
