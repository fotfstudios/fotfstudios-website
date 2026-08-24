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

  it("acepta los cuatro métodos", () => {
    for (const method of ["pendiente", "efectivo", "transferencia", "cortesia"]) {
      expect(validateManualBooking({ ...base, method }).ok).toBe(true);
    }
  });

  it("acepta el método 'pendiente'", () => {
    const r = validateManualBooking({ ...base, method: "pendiente" });
    expect(r.ok).toBe(true);
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

describe("validateManualBooking — descuento manual", () => {
  const withDiscount = (discount: unknown) => validateManualBooking({ ...base, discount });

  it("sin descuento → queda undefined", () => {
    const r = validateManualBooking(base);
    expect(r.ok && r.value.discount).toBeUndefined();
  });

  it("acepta un porcentaje sobre la sala y normaliza el motivo", () => {
    const r = withDiscount({ target: { kind: "room" }, mode: "pct", value: 20, reason: "  primera reserva  " });
    expect(r.ok && r.value.discount).toEqual({
      target: { kind: "room" },
      mode: "pct",
      value: 20,
      reason: "primera reserva",
    });
  });

  it("acepta un monto sobre el total", () => {
    const r = withDiscount({ target: { kind: "total" }, mode: "amount", value: 7994, reason: "" });
    expect(r.ok && r.value.discount?.value).toBe(7994);
  });

  it("acepta un add-on como objetivo", () => {
    const r = withDiscount({ target: { kind: "addon", key: "audioVideo" }, mode: "pct", value: 100, reason: "" });
    expect(r.ok && r.value.discount?.target).toEqual({ kind: "addon", key: "audioVideo" });
  });

  it.each([0, 101, 20.5, -5, "20"])("rechaza porcentajes inválidos: %j", (value) => {
    expect(withDiscount({ target: { kind: "room" }, mode: "pct", value, reason: "" }).ok).toBe(false);
  });

  it.each([0, -1, 1.5, "1000"])("rechaza montos inválidos: %j", (value) => {
    expect(withDiscount({ target: { kind: "total" }, mode: "amount", value, reason: "" }).ok).toBe(false);
  });

  it("rechaza un objetivo desconocido", () => {
    const r = withDiscount({ target: { kind: "propina" }, mode: "pct", value: 10, reason: "" });
    expect(r).toEqual({ ok: false, error: "Objetivo del descuento inválido." });
  });

  it("rechaza un add-on sin key válida", () => {
    expect(withDiscount({ target: { kind: "addon", key: "no válido!" }, mode: "pct", value: 10, reason: "" }).ok).toBe(false);
  });

  it("rechaza un modo desconocido", () => {
    expect(withDiscount({ target: { kind: "room" }, mode: "gratis", value: 10, reason: "" }).ok).toBe(false);
  });

  it("rechaza un motivo de más de 60 caracteres", () => {
    const r = withDiscount({ target: { kind: "room" }, mode: "pct", value: 10, reason: "x".repeat(61) });
    expect(r).toEqual({ ok: false, error: "Motivo del descuento demasiado largo (máx. 60 caracteres)." });
  });

  it("rechaza un descuento en una cortesía (no hay nada que cobrar)", () => {
    const r = validateManualBooking({
      ...base,
      method: "cortesia",
      discount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "" },
    });
    expect(r.ok).toBe(false);
  });
});
