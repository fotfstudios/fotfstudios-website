import { describe, expect, it } from "vitest";
import { trialMoveError } from "./trial-admin";

describe("trialMoveError", () => {
  it.each([
    ["trial_slot_taken", "Ese horario choca con otra reserva o bloqueo."],
    ["trial_in_past", "Ese horario ya pasó."],
    ["trial_same_slot", "La prueba ya está en ese horario."],
    ["trial_not_movable", "Esta prueba ya no se puede mover (está cancelada)."],
    // No debería pasar desde el form: cae en el genérico.
    ["trial_bad_range", "No se pudo mover la prueba."],
    // Texto crudo de Postgres o de red: nunca se muestra.
    ['duplicate key value violates unique constraint "x"', "No se pudo mover la prueba."],
    ["", "No se pudo mover la prueba."],
  ])("%s → %s", (raw, msg) => {
    expect(trialMoveError(raw)).toBe(msg);
  });
});
