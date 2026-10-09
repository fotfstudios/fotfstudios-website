import { describe, expect, it } from "vitest";
import {
  courseMoveError,
  practiceMoveError,
  courseScheduleError,
  halfHourStarts,
  parseInstructor,
  parseProgramSchedule,
  parseSessionMove,
  parseSessionNumber,
} from "./course-admin";

describe("halfHourStarts", () => {
  it("09:00 a 22:30 cada media hora (una sesión de 90 min a las 22:30 termina a medianoche)", () => {
    const s = halfHourStarts();
    expect(s[0]).toBe(540);
    expect(s.at(-1)).toBe(1350);
    expect(s).toHaveLength(28);
    expect(s.every((m) => m % 30 === 0)).toBe(true);
  });
});

describe("parseProgramSchedule", () => {
  const base = { firstDate: "2026-10-08", startMinute: "960", everyWeeks: "1" };

  it("acepta una grilla semanal a las 16:00", () => {
    expect(parseProgramSchedule(base)).toEqual({ ok: true, value: { firstDate: "2026-10-08", startMinute: 960, everyWeeks: 1 } });
  });

  it("acepta cada dos semanas y la media hora", () => {
    const r = parseProgramSchedule({ ...base, startMinute: "990", everyWeeks: "2" });
    expect(r).toEqual({ ok: true, value: { firstDate: "2026-10-08", startMinute: 990, everyWeeks: 2 } });
  });

  it.each(["", "08-10-2026", "2026-02-30"])("rechaza la fecha %j", (firstDate) => {
    expect(parseProgramSchedule({ ...base, firstDate })).toEqual({ ok: false, error: "Fecha inválida." });
  });

  it.each(["965", "-30", "1440", "abc"])("rechaza el inicio %j (solo :00 o :30)", (startMinute) => {
    expect(parseProgramSchedule({ ...base, startMinute })).toEqual({ ok: false, error: "Hora inválida." });
  });

  it.each(["0", "3", "1.5"])("rechaza cada %j semanas", (everyWeeks) => {
    expect(parseProgramSchedule({ ...base, everyWeeks })).toEqual({
      ok: false, error: "Frecuencia inválida: semanal o cada dos semanas.",
    });
  });
});

describe("parseSessionMove", () => {
  it("acepta día y hora a la media hora", () => {
    expect(parseSessionMove({ date: "2026-10-15", startMinute: "1050" })).toEqual({
      ok: true, value: { date: "2026-10-15", startMinute: 1050 },
    });
  });

  it("rechaza minutos que no caen en :00 o :30", () => {
    expect(parseSessionMove({ date: "2026-10-15", startMinute: "1000" })).toEqual({ ok: false, error: "Hora inválida." });
  });
});

describe("parseInstructor", () => {
  it("vacío o espacios = sin instructor", () => {
    expect(parseInstructor("   ")).toEqual({ ok: true, value: null });
  });
  it("recorta y acepta hasta 60 caracteres", () => {
    expect(parseInstructor("  Benja ")).toEqual({ ok: true, value: "Benja" });
  });
  it("más de 60 caracteres es un error", () => {
    expect(parseInstructor("x".repeat(61))).toEqual({ ok: false, error: "Instructor: máximo 60 caracteres." });
  });
});

describe("courseScheduleError — RPC → frase para el dueño", () => {
  it.each([
    ["curso_slot_taken:3", "La sesión 3 choca con otra reserva o bloqueo. No se agendó ninguna."],
    ["curso_in_past:1", "La sesión 1 queda en el pasado."],
    ["curso_already_scheduled", "Este programa ya tiene sus sesiones agendadas."],
    ["curso_fuera_de_ventana", "La última sesión queda fuera de las 10 semanas del curso."],
    ["curso_generation_not_schedulable", "Este programa ya no está activo."],
    ["curso_session_already_scheduled:2", "La sesión 2 ya está agendada: usa Editar para moverla."],
    ["boom", "No se pudieron agendar las sesiones."],
  ])("%s", (raw, msg) => {
    expect(courseScheduleError(raw)).toBe(msg);
  });
});

describe("courseMoveError", () => {
  it.each([
    ["curso_slot_taken:4", "Ese horario choca con otra reserva o bloqueo."],
    ["curso_in_past:4", "Ese horario ya pasó."],
    ["curso_session_unscheduled", "Esa sesión ya no se puede mover."],
    ["curso_generation_not_schedulable", "Este programa ya no está activo."],
    ["boom", "No se pudo mover la sesión."],
  ])("%s", (raw, msg) => {
    expect(courseMoveError(raw)).toBe(msg);
  });
});

describe("parseSessionNumber", () => {
  it("acepta 1..6 (las sesiones del programa)", () => {
    expect(parseSessionNumber("1")).toEqual({ ok: true, value: 1 });
    expect(parseSessionNumber("6")).toEqual({ ok: true, value: 6 });
  });
  it.each(["0", "7", "2.5", "", "x"])("rechaza %j", (raw) => {
    expect(parseSessionNumber(raw)).toEqual({ ok: false, error: "Sesión inválida." });
  });
});

describe("practiceMoveError", () => {
  it.each([
    ["practica_slot_taken", "Ese horario choca con otra reserva o bloqueo."],
    ["practica_en_pasado", "Ese horario ya pasó."],
    ["practica_mismo_horario", "La práctica ya está en ese horario."],
    ["practica_vencida", "Ese día queda fuera del plazo de las horas de práctica."],
    ["practica_no_elegible", "La inscripción ya no está pagada: no se puede mover la práctica."],
    ["practica_no_movible", "Esta práctica ya no se puede mover (está cancelada)."],
    ['duplicate key value violates unique constraint "x"', "No se pudo mover la práctica."],
    ["", "No se pudo mover la práctica."],
  ])("%s → %s", (raw, msg) => {
    expect(practiceMoveError(raw)).toBe(msg);
  });
});
