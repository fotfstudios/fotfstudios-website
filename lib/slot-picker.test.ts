import { describe, expect, it } from "vitest";
import { pickerSlots, type PickerInput } from "./slot-picker";

/** Día abierto 10:00–22:00 con una reserva 16:00–17:30 y un bloqueo 12:00–13:00. */
const base: PickerInput = {
  starts: [9 * 60, 20 * 60, 15 * 60, 15 * 60 + 30, 16 * 60, 17 * 60, 17 * 60 + 30, 12 * 60, 22 * 60, 22 * 60 + 30],
  durationMin: 90,
  occupancy: [
    { id: "r1", start: 16 * 60, end: 17 * 60 + 30, kind: "booking" },
    { id: "b1", start: 12 * 60, end: 13 * 60, kind: "block" },
  ],
  open: 10 * 60,
  close: 22 * 60,
  closed: false,
  dayIsPast: false,
  isToday: false,
  nowMinute: 0,
};

const tagAt = (input: PickerInput, minute: number) => pickerSlots(input).find((s) => s.minute === minute);

describe("pickerSlots — qué horas se pueden elegir de verdad", () => {
  it("un inicio libre que alcanza la duración completa queda disponible", () => {
    expect(tagAt(base, 17 * 60 + 30)).toEqual({ minute: 1050, tag: null, disabled: false });
  });

  it("si el inicio cae dentro de una reserva, está ocupado", () => {
    expect(tagAt(base, 16 * 60)).toMatchObject({ tag: "ocupado", disabled: true });
    expect(tagAt(base, 17 * 60)).toMatchObject({ tag: "ocupado", disabled: true });
  });

  it("si empieza libre pero los 90 min chocan más adelante, no alcanza", () => {
    expect(tagAt(base, 15 * 60)).toMatchObject({ tag: "no alcanza", disabled: true });
    expect(tagAt(base, 15 * 60 + 30)).toMatchObject({ tag: "no alcanza", disabled: true });
  });

  it("un bloqueo de sala se distingue de una reserva", () => {
    expect(tagAt(base, 12 * 60)).toMatchObject({ tag: "bloqueo", disabled: true });
  });

  it("una sesión de curso se rotula como curso, no como bloqueo", () => {
    const conCurso = { ...base, occupancy: [{ id: "c1", start: 20 * 60, end: 21 * 60 + 30, kind: "curso" }] };
    expect(tagAt(conCurso, 20 * 60)).toMatchObject({ tag: "curso", disabled: true });
  });

  it("fuera del horario de apertura se puede elegir, pero avisado", () => {
    expect(tagAt(base, 9 * 60)).toEqual({ minute: 540, tag: "fuera de horario", disabled: false });
    expect(tagAt(base, 22 * 60)).toMatchObject({ tag: "fuera de horario", disabled: false });
  });

  it("no se puede pasar de medianoche", () => {
    expect(tagAt({ ...base, durationMin: 120 }, 22 * 60 + 30)).toMatchObject({ tag: "no alcanza", disabled: true });
  });

  it("un día cerrado deja todo como fuera de horario (el dueño decide)", () => {
    expect(tagAt({ ...base, closed: true }, 17 * 60 + 30)).toMatchObject({ tag: "fuera de horario", disabled: false });
  });

  it("hoy, lo que ya empezó está en el pasado; un día pasado entero también", () => {
    expect(tagAt({ ...base, isToday: true, nowMinute: 18 * 60 }, 17 * 60 + 30)).toMatchObject({ tag: "pasado", disabled: true });
    expect(tagAt({ ...base, dayIsPast: true }, 17 * 60 + 30)).toMatchObject({ tag: "pasado", disabled: true });
  });

  it("al mover una sesión, su propio bloque no la tapa", () => {
    const moving = { ...base, ignoreId: "r1" };
    expect(tagAt(moving, 16 * 60)).toEqual({ minute: 960, tag: null, disabled: false });
  });

  it("la duración manda: 1 h a las 15:00 sí alcanza antes de la reserva de las 16:00", () => {
    expect(tagAt({ ...base, durationMin: 60 }, 15 * 60)).toEqual({ minute: 900, tag: null, disabled: false });
  });
});
