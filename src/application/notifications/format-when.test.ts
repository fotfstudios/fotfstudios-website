import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { formatSessionParts, formatSessionWhen } from "./format-when";

const TZ = "America/Santiago";
// "Hoy" fijo para que el año se decida de forma determinista.
const now = DateTime.fromISO("2026-09-14T12:00:00-03:00");

describe("formatSessionWhen — la única forma de escribir un horario en un correo", () => {
  it("día, fecha y hora en zona Santiago, sin año cuando es el año en curso", () => {
    expect(formatSessionWhen("2026-07-12T18:00:00Z", TZ, { now })).toBe("domingo 12 de julio, 14:00 h");
  });

  it("con término: rango de horas", () => {
    expect(formatSessionWhen("2026-07-12T18:00:00Z", TZ, { endsAt: "2026-07-12T20:00:00Z", now })).toBe(
      "domingo 12 de julio, 14:00–16:00 h",
    );
  });

  it("otro año: lo dice (una reserva manual puede ser para dentro de meses)", () => {
    expect(formatSessionWhen("2027-01-05T13:00:00Z", TZ, { now })).toBe("martes 5 de enero de 2027, 10:00 h");
  });

  it("el año se compara en la zona del estudio, no en UTC", () => {
    // 31/dic 23:30 Santiago = 1/ene 02:30 UTC del año siguiente.
    expect(formatSessionWhen("2027-01-01T02:30:00Z", TZ, { now })).toBe("jueves 31 de diciembre, 23:30 h");
  });
});

describe("formatSessionParts — la ficha Fecha / Hora de los correos de reserva", () => {
  it("parte el mismo horario: fecha con mayúscula, rango y duración", () => {
    expect(formatSessionParts("2026-07-12T18:00:00Z", TZ, { endsAt: "2026-07-12T20:00:00Z", now })).toEqual({
      date: "Domingo 12 de julio",
      time: "14:00–16:00",
      duration: "2 h",
    });
  });

  it("duraciones con minutos", () => {
    expect(formatSessionParts("2026-07-12T18:00:00Z", TZ, { endsAt: "2026-07-12T19:30:00Z", now }).duration).toBe("1 h 30 min");
    expect(formatSessionParts("2026-07-12T18:00:00Z", TZ, { endsAt: "2026-07-12T18:45:00Z", now }).duration).toBe("45 min");
  });

  it("sin término: solo la hora y sin duración; otro año: lo dice", () => {
    expect(formatSessionParts("2027-01-05T13:00:00Z", TZ, { now })).toEqual({
      date: "Martes 5 de enero de 2027",
      time: "10:00",
      duration: null,
    });
  });
});
