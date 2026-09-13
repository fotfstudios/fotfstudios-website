"use client";

import { useCallback, useReducer } from "react";
import {
  INITIAL,
  otpReducer,
  sendErrorMessage,
  verifyErrorMessage,
  type OtpState,
} from "@/src/domain/auth/otp-login";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";

/**
 * Acceso por código de un solo uso, el mismo en /cuenta/login y en el widget de
 * reserva. `send` pide el código (el correo de Supabase trae código + enlace; con
 * `emailRedirectTo` el enlace vuelve a /auth/callback), `verify` lo canjea y deja
 * la sesión en el browser — quien llama decide qué pasa después (navegar o
 * `router.refresh()` para que el server re-resuelva la sesión).
 *
 * shouldCreateUser:true — entrar y crear cuenta son el mismo gesto: el primer
 * código crea el usuario si no existe.
 */
export function useOtpLogin({ emailRedirectTo }: { emailRedirectTo?: string } = {}) {
  const [state, dispatch] = useReducer(otpReducer, INITIAL);

  const send = useCallback(
    async (email: string): Promise<boolean> => {
      const to = email.trim();
      if (!to) return false;
      dispatch({ type: "send" });
      const { error } = await createAuthBrowserClient().auth.signInWithOtp({
        email: to,
        options: { shouldCreateUser: true, ...(emailRedirectTo ? { emailRedirectTo } : {}) },
      });
      if (error) {
        console.warn("[otp-login:send]", error.message);
        dispatch({ type: "send_failed", error: sendErrorMessage(error) });
        return false;
      }
      dispatch({ type: "sent", email: to });
      return true;
    },
    [emailRedirectTo],
  );

  const verify = useCallback(
    async (code: string): Promise<boolean> => {
      const token = code.trim();
      if (state.step !== "code" || !token) return false;
      dispatch({ type: "verify" });
      const { error } = await createAuthBrowserClient().auth.verifyOtp({
        email: state.sentTo,
        token,
        type: "email",
      });
      if (error) {
        dispatch({ type: "verify_failed", error: verifyErrorMessage(error) });
        return false;
      }
      dispatch({ type: "verified" });
      return true;
    },
    [state],
  );

  const resend = useCallback(
    (): Promise<boolean> => (state.step === "code" ? send(state.sentTo) : Promise.resolve(false)),
    [state, send],
  );

  const changeEmail = useCallback(() => dispatch({ type: "change_email" }), []);

  return { state, send, verify, resend, changeEmail } as const;
}

export type { OtpState };
