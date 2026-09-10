import { describe, expect, it } from "vitest";
import { EMAIL_MAX, EMAIL_RE, normalizeEmail, normalizePhone, normalizePhoneCl, phoneDigits } from "./contact";

describe("normalizeEmail", () => {
  it.each([
    ["  Matias.Rojas@Gmail.com ", "matias.rojas@gmail.com"],
    ["a@b.cl", "a@b.cl"],
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it.each(["", "   ", "sin-arroba", "a@b", "a@b.c", "a b@c.cl", "@b.cl", "a@.cl"])("rechaza %s", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });

  it("rechaza sobre el tope de 120 y acepta justo en el tope", () => {
    const local = "x".repeat(EMAIL_MAX - "@gmail.com".length);
    expect(normalizeEmail(`${local}@gmail.com`)).toHaveLength(EMAIL_MAX);
    expect(normalizeEmail(`${local}y@gmail.com`)).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("EMAIL_RE es el espejo del gate SQL", () => {
    expect(EMAIL_RE.test("matias.rojas@gmail.com")).toBe(true);
    expect(EMAIL_RE.test("con espacio@gmail.com")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+56 9 6280 3298", "+56962803298"],
    ["(+56) 9-1234-5678", "+56912345678"], // paridad con application.test.ts
    ["(+56) 9-6280 3298", "+56962803298"], // paridad con lead.test.ts
    ["962803298", "+56962803298"], // móvil chileno pelado → forma canónica
    ["0056962803298", "+56962803298"], // 00 internacional: al sacarlo quedan 11 dígitos
    ["00981234567", "+56981234567"], // 00 + móvil chileno
    // El 00 se saca SOLO si lo que queda sigue siendo un teléfono (8–15). Acá
    // quedarían 6 dígitos, así que no se toca: es el mismo valor que
    // parseApplication/parseCourseLead aceptan hoy (si volviera null, una
    // postulación que hoy entra empezaría a rebotar).
    ["00123456", "00123456"],
    ["+1 415 555 0100", "+14155550100"], // extranjero: pasa por el rango 8–15
    ["4155550100", "4155550100"], // sin +, no chileno: se conserva tal cual
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each(["", "12345", "1234567", "+1234567890123456", "no-es-fono", null, undefined])(
    "rechaza %s",
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );

  it("el resultado nunca supera los 40 caracteres del CHECK customers_phone_len", () => {
    expect(normalizePhone("+123456789012345")).toHaveLength(16);
  });
});

describe("phoneDigits", () => {
  it("deja solo dígitos y vuelve null si no queda ninguno", () => {
    expect(phoneDigits("+56 9 8123 4567")).toBe("56981234567");
    expect(phoneDigits("(9) 6280-3298")).toBe("962803298");
    expect(phoneDigits("sin números")).toBeNull();
    expect(phoneDigits(null)).toBeNull();
  });
});

// Paridad exacta con lib/whatsapp.test.ts: normalizePhoneCl se movió acá.
describe("normalizePhoneCl", () => {
  it.each([
    ["+56 9 6280 3298", "56962803298"],
    ["56962803298", "56962803298"],
    ["962803298", "56962803298"],
    ["9 6280 3298", "56962803298"],
    ["0056962803298", "56962803298"],
  ])("normaliza %s → %s", (raw, expected) => {
    expect(normalizePhoneCl(raw)).toBe(expected);
  });

  it.each(["", "12345", "812803298", "5696280329", "569628032988"])("rechaza %s", (raw) => {
    expect(normalizePhoneCl(raw)).toBeNull();
  });

  it("acepta la salida de normalizePhone (el teléfono guardado alimenta waLink)", () => {
    expect(normalizePhoneCl(normalizePhone("962803298") as string)).toBe("56962803298");
  });
});
