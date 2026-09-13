"use client";

import { Fragment, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { btn, inputCls } from "@/components/admin/ui/styles";
import { useOtpLogin } from "@/components/cuenta/useOtpLogin";
import { safeNext } from "@/src/domain/auth/callback-redirect";
import { resolveAuthOrigin } from "@/lib/site";

/**
 * Acceso de clientes: el código del correo se escribe aquí mismo (Supabase lo
 * manda en grande; su largo es otp_length del proyecto — prod usa 8 — y el
 * cliente no lo asume) y, como vía secundaria, el enlace del mismo correo, que
 * vuelve por /auth/callback. Mismo gesto que el login en línea del widget de
 * reserva (useOtpLogin); entrar y crear cuenta son lo mismo.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackFailed = params.get("error") === "auth";
  // `next` permite volver al flujo de origen (p. ej. /reservar); el callback
  // re-valida contra la misma allow-list, esto es solo UX.
  const next = safeNext(params.get("next")) ?? "/cuenta";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // Host del enlace: canónico en el dominio de prod; el origen actual en preview
  // (*.vercel.app) y local, para volver al mismo deployment y canjear el código
  // contra su propia DB (staging/local). Ver resolveAuthOrigin.
  const { state, send, verify, resend, changeEmail } = useOtpLogin({
    emailRedirectTo: `${resolveAuthOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
  });

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    await send(email);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    // La sesión ya quedó en el browser; el middleware deja pasar a `next` y
    // refresh hace que el server la vea.
    if (await verify(code)) {
      router.replace(next);
      router.refresh();
    }
  };

  const sentTo = state.step === "code" ? state.sentTo : null;

  return (
    <main data-surface="tool" className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm border hairline bg-ink/40 p-8">
        <div className="flex items-center gap-2.5">
          <Logo variant="mini" color="gold" height={26} />
          <span className="label text-bone-quiet">Mi cuenta</span>
        </div>

        <h1 className="font-display mt-6 text-3xl text-bone">Entra o crea tu cuenta</h1>

        {/* Región de estado presente desde el primer render (vacía hasta enviar):
            una live region que nace junto con su texto no se anuncia (WCAG 4.1.3). */}
        <p role="status" className={`text-sm leading-relaxed text-bone-dim ${sentTo ? "mt-4" : ""}`}>
          {sentTo && (
            <>
              Te enviamos un código a <strong className="text-bone">{sentTo}</strong>. Revisa tu correo — y el
              spam, por si acaso.
            </>
          )}
        </p>

        {/* Los pasos van con key: tienen la misma forma (p, form → label, input,
            button) y sin key React reutilizaría el mismo <input>, así que el del
            código nunca se montaría y su autoFocus no correría. */}
        {state.step === "email" ? (
          <Fragment key="email">
            <p className="mt-4 text-sm leading-relaxed text-bone-dim">
              Te enviamos un código a tu correo. Si aún no tienes cuenta,{" "}
              <strong className="text-bone">te la creamos al entrar</strong> — sin contraseñas.
            </p>
            <form onSubmit={submitEmail} className="mt-5 flex flex-col gap-3">
              {callbackFailed && (
                <p role="alert" className="text-xs leading-relaxed text-sirena">
                  No pudimos iniciar tu sesión con ese enlace. Pide un código nuevo.
                </p>
              )}
              <label className="label text-bone-quiet">
                Correo
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="tu@correo.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </label>
              {state.error && (
                <p role="alert" className="text-xs leading-relaxed text-sirena">
                  {state.error}
                </p>
              )}
              <button type="submit" disabled={state.busy} className={`${btn("primary", "md")} mt-1 w-full`}>
                {state.busy ? "Enviando…" : "Enviar código"}
              </button>
            </form>
          </Fragment>
        ) : (
          <Fragment key="code">
            <form onSubmit={submitCode} className="mt-5 flex flex-col gap-3">
              <label className="label text-bone-quiet">
                Código
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="Código del correo"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${inputCls} mt-1.5 tracking-[0.3em]`}
                />
              </label>
              {state.error && (
                <p role="alert" className="text-xs leading-relaxed text-sirena">
                  {state.error}
                </p>
              )}
              <button
                type="submit"
                disabled={state.busy || !code.trim()}
                className={`${btn("primary", "md")} mt-1 w-full`}
              >
                {state.verified ? "Entrando…" : state.busy ? "Verificando…" : "Entrar"}
              </button>
              {/* A 375px los dos rótulos no caben en una fila (261px útiles): apilados. */}
              <div className="-mx-3 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={state.busy}
                  className={`${btn("ghost", "sm")} whitespace-nowrap`}
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCode("");
                    changeEmail();
                  }}
                  disabled={state.busy}
                  className={`${btn("ghost", "sm")} whitespace-nowrap`}
                >
                  Cambiar correo
                </button>
              </div>
            </form>
            <p className="mt-5 text-xs leading-relaxed text-bone-quiet">
              También puedes abrir el enlace del correo: te deja dentro igual.
            </p>
          </Fragment>
        )}

        <p className="label-sm mt-6">
          <Link href="/" className="text-bone-quiet transition-colors hover:text-gold">
            ← Volver al sitio
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function CuentaLogin() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
