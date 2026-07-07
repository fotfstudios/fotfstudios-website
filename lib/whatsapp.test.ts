import { describe, expect, it } from "vitest";
import { manualBookingWhatsAppMessage, normalizePhoneCl, waLink } from "./whatsapp";

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
});

describe("waLink", () => {
  it("arma el link wa.me con el texto URL-encodeado", () => {
    expect(waLink("+56 9 6280 3298", "Hola ¿qué tal?")).toBe(
      "https://wa.me/56962803298?text=Hola%20%C2%BFqu%C3%A9%20tal%3F",
    );
  });

  it("devuelve null si el teléfono no se reconoce", () => {
    expect(waLink("12345", "Hola")).toBeNull();
  });
});

describe("manualBookingWhatsAppMessage", () => {
  const base = {
    name: "Camila",
    date: "2026-07-09",
    startMinute: 18 * 60,
    durationHours: 2,
    total: 49_980,
    method: "efectivo" as const,
    addonNames: ["Grabación de audio"],
  };

  it("variante pagada: saludo con nombre, día/hora, extras y total en efectivo", () => {
    const msg = manualBookingWhatsAppMessage(base);
    expect(msg).toContain("Hola Camila, tu reserva en *FOTF Studios* está confirmada.");
    expect(msg).toContain("*Día y hora:* jueves 9 de julio, 18:00–20:00 h");
    expect(msg).toContain("*Duración:* 2 horas");
    expect(msg).toContain("*Extras:* Grabación de audio");
    expect(msg).toContain("*Total (IVA incl.):* `$49.980` — pagado en efectivo");
    expect(msg).toContain("*Dirección:*");
  });

  it("variante transferencia", () => {
    const msg = manualBookingWhatsAppMessage({ ...base, method: "transferencia" });
    expect(msg).toContain("pagado por transferencia");
  });

  it("incluye los links de términos y privacidad (consentimiento)", () => {
    const msg = manualBookingWhatsAppMessage(base);
    expect(msg).toContain("https://www.fotfstudios.cl/terminos");
    expect(msg).toContain("https://www.fotfstudios.cl/privacidad");
  });

  it("cortesía también lleva los links de términos", () => {
    const msg = manualBookingWhatsAppMessage({ ...base, method: "cortesia", total: null });
    expect(msg).toContain("https://www.fotfstudios.cl/terminos");
  });

  it("variante cortesía: sin línea de total", () => {
    const msg = manualBookingWhatsAppMessage({ ...base, method: "cortesia", total: null });
    expect(msg).toContain("*Cortesía:* sesión sin cobro.");
    expect(msg).not.toContain("Total");
  });

  it("sin nombre ni extras: saludo genérico y sin línea de extras", () => {
    const msg = manualBookingWhatsAppMessage({ ...base, name: undefined, addonNames: [] });
    expect(msg).toContain("Hola, tu reserva en *FOTF Studios* está confirmada.");
    expect(msg).not.toContain("*Extras:*");
    expect(msg).toContain("*Duración:* 2 horas");
  });

  it("singular de una hora", () => {
    const msg = manualBookingWhatsAppMessage({ ...base, durationHours: 1 });
    expect(msg).toContain("*Duración:* 1 hora");
    expect(msg).toContain("18:00–19:00 h");
  });
});
