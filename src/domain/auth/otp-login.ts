/**
 * Máquina de estados del acceso por código (OTP por correo), compartida por
 * /cuenta/login y el widget de reserva: entrar y crear cuenta son el mismo gesto,
 * y tiene que sentirse igual en los dos lugares. Pura — el hook
 * (components/cuenta/useOtpLogin.ts) pone Supabase y React encima.
 *
 * `sentTo` se congela al enviar: el código se verifica contra el correo al que
 * salió, aunque el usuario edite el campo después.
 */
export type OtpState =
  | { step: "email"; busy: boolean; error: string | null }
  | { step: "code"; sentTo: string; busy: boolean; error: string | null; verified: boolean };

export type OtpAction =
  | { type: "send" }
  | { type: "sent"; email: string }
  | { type: "send_failed"; error: string }
  | { type: "verify" }
  | { type: "verified" }
  | { type: "verify_failed"; error: string }
  | { type: "change_email" };

export const INITIAL: OtpState = { step: "email", busy: false, error: null };

export function otpReducer(state: OtpState, action: OtpAction): OtpState {
  switch (action.type) {
    case "send":
      return { ...state, busy: true, error: null };
    case "sent":
      return { step: "code", sentTo: action.email, busy: false, error: null, verified: false };
    case "send_failed":
      return { ...state, busy: false, error: action.error };
    case "verify":
      return state.step === "code" ? { ...state, busy: true, error: null } : state;
    // busy queda en true a propósito: el estado de carga puentea hasta que la
    // sesión llega (navegación o refresh del server) sin un corte visual.
    case "verified":
      return state.step === "code" ? { ...state, busy: true, verified: true } : state;
    case "verify_failed":
      return state.step === "code" ? { ...state, busy: false, error: action.error } : state;
    case "change_email":
      return INITIAL;
  }
}

/** Forma mínima del error de supabase-js que nos interesa (status HTTP). */
export type OtpError = { status?: number };

export function sendErrorMessage(error: OtpError): string {
  return error.status === 429
    ? "Demasiados intentos. Espera unos minutos antes de pedir otro código."
    : "No pudimos enviar el código. Revisa el correo e inténtalo de nuevo.";
}

/**
 * Un solo mensaje, sea cual sea el error: no revelar si el código existe, venció
 * o era de otro correo. Recibe el error igual que sendErrorMessage por simetría.
 */
export function verifyErrorMessage(error: OtpError): string {
  void error;
  return "Código inválido o expirado. Pide uno nuevo.";
}
