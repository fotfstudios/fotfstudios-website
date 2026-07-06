"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { btn, inputCls } from "@/components/admin/ui/styles";
import { safeNext } from "@/src/domain/auth/callback-redirect";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import { resolveAuthOrigin } from "@/lib/site";

type Status = "idle" | "sent" | "ratelimited";

function LoginForm() {
  const params = useSearchParams();
  const callbackFailed = params.get("error") === "auth";
  // `next` permite volver al flujo de origen (p. ej. /reservar); el callback
  // re-valida contra la misma allow-list, esto es solo UX.
  const next = safeNext(params.get("next")) ?? "/cuenta";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const supabase = createAuthBrowserClient();
    // Host del enlace: canónico en el dominio de prod; el origen actual en
    // preview (*.vercel.app) y local, para volver al mismo deployment y canjear
    // el código contra su propia DB (staging/local). Ver resolveAuthOrigin.
    const origin = resolveAuthOrigin();
    // shouldCreateUser:true — entrar y crear cuenta son el mismo gesto: el primer
    // enlace de acceso crea el usuario si no existe.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (error) {
      console.warn("[cuenta-login]", error.message);
      if (error.status === 429) {
        setStatus("ratelimited");
        return;
      }
    }
    // Mensaje genérico siempre: no revelar si el correo ya tenía cuenta.
    setStatus("sent");
  };

  return (
    <main className="booth-glow flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm border hairline bg-ink/40 p-8">
        <div className="flex items-center gap-2.5">
          <Logo variant="mini" color="gold" height={26} />
          <span className="label text-bone-mute">Mi cuenta</span>
        </div>

        <h1 className="font-display mt-6 text-bone" style={{ fontSize: "clamp(1.8rem,5vw,2.4rem)" }}>
          Entra o crea tu cuenta
        </h1>

        {status === "sent" ? (
          <p className="mt-5 text-sm leading-relaxed text-bone-dim">
            Te enviamos un enlace de acceso a <strong className="text-bone">{email}</strong>. Revisa tu correo — y el
            spam, por si acaso.
          </p>
        ) : status === "ratelimited" ? (
          <p className="mt-5 text-sm leading-relaxed text-bone-dim">
            Demasiados intentos. Espera unos minutos antes de pedir otro enlace de acceso.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-bone-dim">
              Te enviamos un enlace de acceso a tu correo. Si aún no tienes cuenta,{" "}
              <strong className="text-bone">te la creamos al entrar</strong> — sin contraseñas.
            </p>
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              {callbackFailed && (
                <p className="label-sm text-sirena">No pudimos iniciar tu sesión con ese enlace. Pide uno nuevo.</p>
              )}
              <label className="label-sm text-bone-mute">
                Correo
                <input
                  type="email"
                  required
                  placeholder="tu@correo.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </label>
              <button type="submit" disabled={busy} className={`${btn("primary", "md")} mt-1 w-full`}>
                {busy ? "Enviando…" : "Enviar enlace de acceso"}
              </button>
            </form>
          </>
        )}

        <p className="label-sm mt-6">
          <Link href="/" className="text-bone-mute transition-colors hover:text-gold">
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
