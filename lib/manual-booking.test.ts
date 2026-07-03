import { describe, expect, it } from "vitest";
import { validateManualBooking } from "./manual-booking";

const base = {
  date: "2026-07-09",
  startMinute: 600,
  durationHours: 2,
  method: "efectivo",
  addonKeys: [] as unknown,
  notes: "",
};

describe("validateManualBooking", () => {
  it("acepta un input válido y normaliza notas", () => {
    const r = validateManualBooking({ ...base, addonKeys: ["audio", "guided"], notes: "  Pagó al llegar  " });
    expect(r).toEqual({
      ok: true,
      value: {
        date: "2026-07-09",
        startMinute: 600,
        durationHours: 2,
        method: "efectivo",
        addonKeys: ["audio", "guided"],
        notes: "Pagó al llegar",
      },
    });
  });

  it.each(["", "09-07-2026", "2026-13-40", "2026-02-30", 20260709])("rechaza fecha inválida: %s", (date) => {
    const r = validateManualBooking({ ...base, date });
    expect(r).toEqual({ ok: false, error: "Fecha inválida." });
  });

  it.each([Number.NaN, -1, 1440, 90.5, "600"])("rechaza inicio inválido: %s", (startMinute) => {
    const r = validateManualBooking({ ...base, startMinute });
    expect(r).toEqual({ ok: false, error: "Hora de inicio inválida." });
  });

  it.each([Number.NaN, 0, -2, 17, 1.5, "2"])("rechaza duración inválida: %s", (durationHours) => {
    const r = validateManualBooking({ ...base, durationHours });
    expect(r).toEqual({ ok: false, error: "Duración inválida: entre 1 y 16 horas." });
  });

  it.each(["", "tarjeta", "CORTESIA", 3])("rechaza método inválido: %s", (method) => {
    const r = validateManualBooking({ ...base, method });
    expect(r).toEqual({ ok: false, error: "Método de pago inválido." });
  });

  it("acepta los tres métodos", () => {
    for (const method of ["efectivo", "transferencia", "cortesia"]) {
      expect(validateManualBooking({ ...base, method }).ok).toBe(true);
    }
  });

  it.each([[["audio", "no válido!"]], ["audio"], [[""]], [[7]]])("rechaza add-ons inválidos: %j", (addonKeys) => {
    const r = validateManualBooking({ ...base, addonKeys });
    expect(r).toEqual({ ok: false, error: "Add-on inválido." });
  });

  it("rechaza notas de más de 500 caracteres", () => {
    const r = validateManualBooking({ ...base, notes: "x".repeat(501) });
    expect(r).toEqual({ ok: false, error: "Notas demasiado largas (máx. 500 caracteres)." });
  });

  it("trata notas no-string como vacías", () => {
    const r = validateManualBooking({ ...base, notes: undefined });
    expect(r.ok && r.value.notes).toBe("");
  });
});
