import { describe, expect, it } from "vitest";
import { guiaErrorMessage, guiaFieldMessage } from "./guia-form";
import type { GuideLeadField, GuideLeadIssueCode } from "@/src/domain/guide/lead";

const FIELDS: GuideLeadField[] = ["email", "source"];
const CODES: GuideLeadIssueCode[] = ["required", "too_long", "invalid"];

describe("guiaFieldMessage", () => {
  it("todo campo × código produce una frase en es-CL, nunca 'undefined'", () => {
    for (const field of FIELDS) {
      for (const code of CODES) {
        const msg = guiaFieldMessage(field, code);
        expect(msg.length).toBeGreaterThan(0);
        expect(msg).not.toMatch(/undefined/);
        expect(msg).toMatch(/\.$|…$/);
      }
    }
  });

  it("el email inválido tiene ayuda específica", () => {
    expect(guiaFieldMessage("email", "invalid")).toMatch(/incompleto/);
  });
});

describe("guiaErrorMessage", () => {
  it("cubre red, rate limit y validación", () => {
    expect(guiaErrorMessage("network")).toMatch(/conexión/i);
    expect(guiaErrorMessage("rate_limited")).toMatch(/intentos/i);
    expect(guiaErrorMessage("validacion")).toMatch(/correo|email/i);
    expect(guiaErrorMessage("json_invalido")).toMatch(/correo|email/i);
  });

  it("el rate limit recuerda revisar el correo (y spam): puede que la guía ya haya llegado", () => {
    expect(guiaErrorMessage("rate_limited")).toMatch(/revisa tu correo/i);
    expect(guiaErrorMessage("rate_limited")).toMatch(/spam/i);
  });

  it("el error genérico habla de la guía, no de una 'solicitud' ni de WhatsApp", () => {
    const msg = guiaErrorMessage("no_disponible");
    expect(msg).toMatch(/gu[ií]a/i);
    expect(msg).not.toMatch(/solicitud|whatsapp/i);
    expect(guiaErrorMessage(undefined)).toBe(msg);
  });
});
