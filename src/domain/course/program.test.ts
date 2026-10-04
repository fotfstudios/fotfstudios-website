import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { COURSE_PROGRAM, planProgramSessions } from "./program";

const TZ = "America/Santiago";
const TITLES = ["Sonido", "Beatmatching", "Frases", "Rekordbox", "Set y FX", "Set final"];
const local = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toFormat("ccc HH:mm");

describe("COURSE_PROGRAM", () => {
  it("6 sesiones de 90 minutos son las 9 horas de clase que se venden", () => {
    expect((COURSE_PROGRAM.sessions * COURSE_PROGRAM.sessionMinutes) / 60).toBe(COURSE_PROGRAM.classHours);
  });
});

describe("planProgramSessions", () => {
  it("seis sesiones semanales de 1,5 h a la misma hora", () => {
    const plan = planProgramSessions({ firstDate: "2027-03-01", startMinute: 19 * 60 + 30, titles: TITLES, tz: TZ });
    expect(plan.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.map((s) => s.title)).toEqual(TITLES);
    for (const s of plan) {
      expect(local(s.startsAt)).toBe("Mon 19:30");
      expect(local(s.endsAt)).toBe("Mon 21:00");
    }
  });

  it("cruza el cambio de hora de septiembre sin correrse (hora de pared)", () => {
    // 2027-09-05 Chile pasa a −03: la grilla parte el lunes 23 de agosto.
    const plan = planProgramSessions({ firstDate: "2027-08-23", startMinute: 19 * 60 + 30, titles: TITLES, tz: TZ });
    expect(plan.map((s) => local(s.startsAt))).toEqual(Array(6).fill("Mon 19:30"));
    expect(plan.map((s) => local(s.endsAt))).toEqual(Array(6).fill("Mon 21:00"));
  });

  it("cada dos semanas cabe en la ventana de 10 semanas", () => {
    const plan = planProgramSessions({
      firstDate: "2027-03-01", startMinute: 18 * 60, titles: TITLES, everyWeeks: 2, tz: TZ,
    });
    expect(plan[5].startsAt.slice(0, 10)).toBe("2027-05-10");
  });

  it("cada tres semanas se sale de la ventana del curso", () => {
    expect(() =>
      planProgramSessions({ firstDate: "2027-03-01", startMinute: 18 * 60, titles: TITLES, everyWeeks: 3, tz: TZ }),
    ).toThrow("curso_fuera_de_ventana");
  });

  it("exige exactamente un título por sesión del programa", () => {
    expect(() =>
      planProgramSessions({ firstDate: "2027-03-01", startMinute: 18 * 60, titles: TITLES.slice(0, 4), tz: TZ }),
    ).toThrow("curso_titulos_invalidos");
  });
});
