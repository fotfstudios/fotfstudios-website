import { describe, expect, it } from "vitest";
import { durationStepFor, validateManualBooking } from "./manual-booking";

/**
 * Toda reserva necesita cliente (ficha o walk-in), así que el base trae un
 * walk-in: los casos de abajo prueban fecha, duración, descuento, etc., no el
 * cliente. El bloque "— cliente" al final lo sobreescribe cuando corresponde.
 */
const base = {
  date: "2026-07-09",
  startMinute: 600,
  durationHours: 2,
  type: "ensayo",
  paid: true,
  method: "efectivo" as unknown,
  addonKeys: [] as unknown,
  notes: "",
  walkInName: "Walk-in de prueba",
};
/** Una cortesía no tiene pago: ni "ya pagó" ni método. */
const cortesia = { type: "cortesia", paid: false, method: null };

describe("validateManualBooking", () => {
  it("acepta un input válido y normaliza notas", () => {
    const r = validateManualBooking({ ...base, addonKeys: ["audio", "guided"], notes: "  Pagó al llegar  " });
    expect(r).toEqual({
      ok: true,
      value: {
        date: "2026-07-09",
        startMinute: 600,
        durationHours: 2,
        type: "ensayo",
        paid: true,
        method: "efectivo",
        addonKeys: ["audio", "guided"],
        notes: "Pagó al llegar",
        customerId: null,
        walkInName: "Walk-in de prueba",
        pointsToRedeem: 0,
        discount: undefined,
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

  describe("duración por tipo", () => {
    it("la cortesía avanza en medias horas; el ensayo (que cobra), en horas enteras", () => {
      expect(durationStepFor("cortesia")).toBe(0.5);
      expect(durationStepFor("ensayo")).toBe(1);
    });

    it("acepta una cortesía de 1,5 h", () => {
      const r = validateManualBooking({ ...base, ...cortesia, durationHours: 1.5 });
      expect(r.ok && r.value.durationHours).toBe(1.5);
    });

    it.each([0.5, 1.25, 16.5])("rechaza una cortesía de %s h", (durationHours) => {
      const r = validateManualBooking({ ...base, ...cortesia, durationHours });
      expect(r).toEqual({ ok: false, error: "Duración inválida: entre 1 y 16 horas, en medias horas." });
    });

    it.each([
      [true, "efectivo"],
      [false, null],
    ])("un ensayo (pagado=%s) de 1,5 h sigue siendo inválido", (paid, method) => {
      const r = validateManualBooking({ ...base, paid, method, durationHours: 1.5 });
      expect(r).toEqual({ ok: false, error: "Duración inválida: entre 1 y 16 horas." });
    });
  });

  // Tipo, ¿ya pagó? y método son tres ejes: antes vivían mezclados en una sola
  // lista "pendiente / efectivo / transferencia / cortesía".
  describe("tipo, pago y método", () => {
    it.each(["", "pendiente", "efectivo", "CORTESIA", 3, undefined])("rechaza tipo inválido: %s", (type) => {
      expect(validateManualBooking({ ...base, type })).toEqual({ ok: false, error: "Tipo de reserva inválido." });
    });

    it("ensayo pendiente: sin método", () => {
      const r = validateManualBooking({ ...base, paid: false, method: null });
      expect(r.ok && { paid: r.value.paid, method: r.value.method }).toEqual({ paid: false, method: null });
    });

    it.each(["transferencia", "efectivo"])("ensayo pagado por %s", (method) => {
      const r = validateManualBooking({ ...base, method });
      expect(r.ok && r.value.method).toBe(method);
    });

    it.each(["tarjeta", "mercadopago", "puntos", "pendiente", 3])("rechaza método inválido: %s", (method) => {
      expect(validateManualBooking({ ...base, method })).toEqual({ ok: false, error: "Método de pago inválido." });
    });

    it("pagado sin método y sin canje → hay que elegirlo", () => {
      expect(validateManualBooking({ ...base, method: null })).toEqual({ ok: false, error: "Elige el método de pago." });
    });

    it("pendiente CON método → contradicción", () => {
      expect(validateManualBooking({ ...base, paid: false, method: "efectivo" })).toEqual({
        ok: false,
        error: "Una reserva pendiente no lleva método de pago.",
      });
    });

    it.each([
      [true, null],
      [false, "efectivo"],
      [true, "transferencia"],
    ])("una cortesía no admite pago (pagado=%s, método=%s)", (paid, method) => {
      expect(validateManualBooking({ ...base, type: "cortesia", paid, method })).toEqual({
        ok: false,
        error: "Una cortesía ya es sin cobro: no admite pago.",
      });
    });

    it("'paid' tiene que ser booleano", () => {
      expect(validateManualBooking({ ...base, paid: "si" })).toEqual({ ok: false, error: "Indica si ya pagó." });
    });
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
      ...cortesia,
      discount: { target: { kind: "room" }, mode: "pct", value: 20, reason: "" },
    });
    expect(r.ok).toBe(false);
  });
});

/**
 * Cliente: o una ficha del directorio (por id) o un walk-in solo-nombre. El
 * contacto NO viaja nunca en el request — el servidor lo lee de `customers`—,
 * así un navegador manipulado no puede inventar el snapshot de una reserva.
 */
describe("validateManualBooking — cliente", () => {
  const UUID = "f0bfd658-5aa7-4f12-a3c4-eaddd41a2335";
  /** El base del archivo no trae cliente; acá casi todos los casos necesitan uno. */
  const conFicha = { ...base, customerId: UUID };

  it("acepta un uuid de ficha", () => {
    const r = validateManualBooking({ ...conFicha, walkInName: "" });
    expect(r.ok && r.value.customerId).toBe(UUID);
    expect(r.ok && r.value.walkInName).toBe("");
  });

  it.each(["no-es-uuid", "123", "f0bfd658-5aa7-4f12-a3c4", 42, {}])("rechaza customerId inválido: %s", (customerId) => {
    expect(validateManualBooking({ ...base, customerId })).toEqual({ ok: false, error: "Cliente inválido." });
  });

  it("acepta un walk-in solo-nombre, sin ficha", () => {
    const r = validateManualBooking({ ...base, walkInName: "  Pía  " });
    expect(r.ok && r.value).toMatchObject({ customerId: null, walkInName: "Pía" });
  });

  it("null y cadena vacía en customerId son “sin ficha” (con nombre, siguen siendo válidos)", () => {
    for (const customerId of [null, ""]) {
      const r = validateManualBooking({ ...base, customerId, walkInName: "Pía" });
      expect(r.ok && r.value.customerId).toBeNull();
    }
  });

  /**
   * Sin ficha Y sin nombre queda una reserva de nadie: las cuatro columnas de
   * contacto en NULL y —si cobra— un pedido pagado anónimo. Lo encontró la
   * revisión: era alcanzable desde la UI real, no solo por un request armado.
   */
  it("rechaza una reserva sin ficha y sin nombre", () => {
    expect(validateManualBooking({ ...base, walkInName: "" })).toEqual({
      ok: false,
      error: "Elige un cliente o escribe un nombre.",
    });
    expect(validateManualBooking({ ...base, walkInName: "   " })).toEqual({
      ok: false,
      error: "Elige un cliente o escribe un nombre.",
    });
  });

  it("con ficha no hace falta nombre", () => {
    expect(validateManualBooking({ ...conFicha, walkInName: "" }).ok).toBe(true);
  });

  it("rechaza un nombre de walk-in sobre el tope de la columna", () => {
    expect(validateManualBooking({ ...base, walkInName: "x".repeat(81) })).toEqual({
      ok: false,
      error: "El nombre no puede superar los 80 caracteres.",
    });
    expect(validateManualBooking({ ...base, walkInName: "x".repeat(80) }).ok).toBe(true);
  });
});

/**
 * Canje de puntos desde la consola. El saldo cuelga de la ficha, así que sin
 * ficha no hay de quién descontar; y una cortesía no cobra nada, así que no hay
 * contra qué canjear. El monto DEFINITIVO lo decide la DB bajo lock de fila —
 * acá solo se valida la intención, igual que con el descuento manual.
 */
describe("validateManualBooking — canje de puntos", () => {
  const UUID = "f0bfd658-5aa7-4f12-a3c4-eaddd41a2335";
  const conFicha = { ...base, customerId: UUID, walkInName: "" };

  it("sin pointsToRedeem el canje queda en 0", () => {
    const r = validateManualBooking(conFicha);
    expect(r.ok && r.value.pointsToRedeem).toBe(0);
  });

  it("acepta un entero positivo con ficha", () => {
    const r = validateManualBooking({ ...conFicha, pointsToRedeem: 5000 });
    expect(r.ok && r.value.pointsToRedeem).toBe(5000);
  });

  it("cero explícito es válido", () => {
    expect(validateManualBooking({ ...conFicha, pointsToRedeem: 0 }).ok).toBe(true);
  });

  it.each([-1, 1.5, "5000", Number.NaN, 10_000_001])("rechaza pointsToRedeem inválido: %s", (pointsToRedeem) => {
    expect(validateManualBooking({ ...conFicha, pointsToRedeem })).toEqual({ ok: false, error: "Puntos inválidos." });
  });

  it("canjear SIN ficha se rechaza: el saldo cuelga de la ficha", () => {
    expect(validateManualBooking({ ...base, walkInName: "Walk-in", pointsToRedeem: 1000 })).toEqual({
      ok: false,
      error: "Para canjear puntos, elige un cliente con ficha.",
    });
  });

  it("una cortesía no admite canje: ya es sin cobro", () => {
    expect(validateManualBooking({ ...conFicha, ...cortesia, pointsToRedeem: 1000 })).toEqual({
      ok: false,
      error: "Una cortesía ya es sin cobro: no admite canje de puntos.",
    });
  });

  it("una cortesía CON ficha y sin canje sigue siendo válida", () => {
    expect(validateManualBooking({ ...conFicha, ...cortesia }).ok).toBe(true);
  });

  it("pagado SIN método vale si hay canje (el servidor verifica que cubra el total)", () => {
    const r = validateManualBooking({ ...conFicha, method: null, pointsToRedeem: 9990 });
    expect(r.ok && { method: r.value.method, points: r.value.pointsToRedeem }).toEqual({ method: null, points: 9990 });
  });
});

describe("validateManualBooking — prueba del curso", () => {
  const ficha = "3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b";
  const prueba = { ...base, type: "prueba", durationHours: 1, customerId: ficha, walkInName: "" };

  it("acepta una prueba de 1 h con ficha, pendiente o pagada", () => {
    expect(validateManualBooking({ ...prueba, paid: false, method: null }).ok).toBe(true);
    expect(validateManualBooking({ ...prueba, paid: true, method: "transferencia" }).ok).toBe(true);
  });

  it.each([
    [{ durationHours: 2 }, "La prueba dura 1 hora."],
    [{ addonKeys: ["audio"] }, "La prueba no lleva extras."],
    [{ pointsToRedeem: 1000 }, "La prueba tiene precio fijo: sin descuento ni puntos."],
    [
      { discount: { target: { kind: "room" }, mode: "pct", value: 10, reason: "" } },
      "La prueba tiene precio fijo: sin descuento ni puntos.",
    ],
    [{ customerId: null, walkInName: "Walk-in" }, "Para una prueba elige un cliente con ficha (el crédito va a su email)."],
  ])("rechaza %j", (over, error) => {
    expect(validateManualBooking({ ...prueba, ...over })).toEqual({ ok: false, error });
  });

  it("avanza en horas enteras (no es cortesía)", () => {
    expect(durationStepFor("prueba")).toBe(1);
  });
});
