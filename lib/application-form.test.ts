import { describe, expect, it } from "vitest";
import { applicationErrorMessage, applicationFieldMessage } from "./application-form";

describe("applicationFieldMessage", () => {
  it("required nombra el campo", () => {
    expect(applicationFieldMessage("name", "required")).toMatch(/nombre/i);
    expect(applicationFieldMessage("pitch", "required")).toMatch(/experiencia/i);
    expect(applicationFieldMessage("availability", "required")).toMatch(/disponibilidad/i);
  });

  it("too_long indica largo excesivo", () => {
    expect(applicationFieldMessage("pitch", "too_long")).toMatch(/largo/i);
  });

  it("invalid da una pista específica por campo", () => {
    expect(applicationFieldMessage("email", "invalid")).toMatch(/email/i);
    expect(applicationFieldMessage("phone", "invalid")).toMatch(/\+56/);
    expect(applicationFieldMessage("mixUrl", "invalid")).toMatch(/link/i);
  });
});

describe("applicationErrorMessage", () => {
  it("network → mensaje de conexión", () => {
    expect(applicationErrorMessage("network")).toMatch(/conexión/i);
  });

  it("rate_limited → mensaje de esperar", () => {
    expect(applicationErrorMessage("rate_limited")).toMatch(/demasiados|espera/i);
  });

  it("código desconocido → fallback", () => {
    expect(applicationErrorMessage("cualquier")).toMatch(/no pudimos/i);
    expect(applicationErrorMessage(null)).toMatch(/no pudimos/i);
    expect(applicationErrorMessage(undefined)).toMatch(/no pudimos/i);
  });

  it("validacion/json_invalido → revisar datos", () => {
    expect(applicationErrorMessage("validacion")).toMatch(/revisa/i);
    expect(applicationErrorMessage("json_invalido")).toMatch(/revisa/i);
  });
});
