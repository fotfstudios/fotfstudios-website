import { describe, expect, it } from "vitest";
import { INITIAL, otpReducer, sendErrorMessage, verifyErrorMessage, type OtpState } from "./otp-login";

const code = (over: Partial<Extract<OtpState, { step: "code" }>> = {}): OtpState => ({
  step: "code",
  sentTo: "dj@correo.cl",
  busy: false,
  error: null,
  verified: false,
  ...over,
});

describe("otpReducer — paso correo", () => {
  it("send marca busy y limpia el error anterior", () => {
    const s = otpReducer({ ...INITIAL, error: "algo" }, { type: "send" });
    expect(s).toEqual({ step: "email", busy: true, error: null });
  });

  it("sent pasa al paso código con el correo congelado", () => {
    const s = otpReducer({ step: "email", busy: true, error: null }, { type: "sent", email: "dj@correo.cl" });
    expect(s).toEqual(code());
  });

  it("send_failed vuelve a idle con el mensaje", () => {
    const s = otpReducer({ step: "email", busy: true, error: null }, { type: "send_failed", error: "Demasiados intentos." });
    expect(s).toEqual({ step: "email", busy: false, error: "Demasiados intentos." });
  });
});

describe("otpReducer — paso código", () => {
  it("verify marca busy; verified deja busy en true (puentea hasta que llega la sesión)", () => {
    const busy = otpReducer(code({ error: "x" }), { type: "verify" });
    expect(busy).toEqual(code({ busy: true }));
    expect(otpReducer(busy, { type: "verified" })).toEqual(code({ busy: true, verified: true }));
  });

  it("verify_failed conserva el correo y muestra el error", () => {
    const s = otpReducer(code({ busy: true }), { type: "verify_failed", error: "Código inválido o expirado." });
    expect(s).toEqual(code({ error: "Código inválido o expirado." }));
  });

  it("resend: send en paso código no cambia de paso; sent lo deja igual con el mismo correo", () => {
    const busy = otpReducer(code(), { type: "send" });
    expect(busy).toEqual(code({ busy: true }));
    expect(otpReducer(busy, { type: "sent", email: "dj@correo.cl" })).toEqual(code());
  });

  it("change_email vuelve al paso correo sin error", () => {
    expect(otpReducer(code({ error: "x" }), { type: "change_email" })).toEqual(INITIAL);
  });
});

describe("mensajes de error", () => {
  it("429 al enviar es el límite de intentos; cualquier otro error, revisar el correo", () => {
    expect(sendErrorMessage({ status: 429 })).toMatch(/Demasiados intentos/);
    expect(sendErrorMessage({ status: 500 })).toMatch(/Revisa el correo/);
    expect(sendErrorMessage({})).toMatch(/Revisa el correo/);
  });

  it("verificar falla siempre con el mismo mensaje (no revela si el código existe)", () => {
    expect(verifyErrorMessage({ status: 403 })).toBe(verifyErrorMessage({ status: 401 }));
    expect(verifyErrorMessage({})).toMatch(/inválido o expirado/);
  });
});
