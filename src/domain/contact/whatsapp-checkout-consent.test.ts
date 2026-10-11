import { describe, expect, it } from "vitest";
import { applyCheckoutWhatsAppChoice, whatsappDecided } from "./whatsapp-checkout-consent";

const NEVER = { optInAt: null, optOutAt: null };
const IN = { optInAt: "2026-10-01T12:00:00Z", optOutAt: null };
const OUT = { optInAt: "2026-09-01T12:00:00Z", optOutAt: "2026-10-01T12:00:00Z" };

describe("whatsappDecided", () => {
  it("decidió si alguna vez se dio de alta o de baja", () => {
    expect(whatsappDecided(NEVER)).toBe(false);
    expect(whatsappDecided(IN)).toBe(true);
    expect(whatsappDecided(OUT)).toBe(true);
    expect(whatsappDecided({ optInAt: null, optOutAt: "2026-10-01T12:00:00Z" })).toBe(true);
  });
});

describe("applyCheckoutWhatsAppChoice", () => {
  it("con sesión (dueño de la ficha) la elección se aplica siempre", () => {
    expect(applyCheckoutWhatsAppChoice({ authenticated: true, consent: OUT })).toBe(true);
    expect(applyCheckoutWhatsAppChoice({ authenticated: true, consent: NEVER })).toBe(true);
  });

  it("un invitado solo fija la preferencia de una ficha que aún no decidió", () => {
    expect(applyCheckoutWhatsAppChoice({ authenticated: false, consent: NEVER })).toBe(true);
    expect(applyCheckoutWhatsAppChoice({ authenticated: false, consent: null })).toBe(true);
    expect(applyCheckoutWhatsAppChoice({ authenticated: false, consent: IN })).toBe(false);
    expect(applyCheckoutWhatsAppChoice({ authenticated: false, consent: OUT })).toBe(false);
  });
});
