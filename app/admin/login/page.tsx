"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { btn, inputCls } from "@/components/admin/ui/styles";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import { SITE_URL } from "@/lib/site";

type Status = "idle" | "sent" | "ratelimited";

function LoginForm() {
  const params = useSearchParams();
  const callbackFailed = params.get("error") === "auth";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const supabase = createAuthBrowserClient();
    // En producción fijamos el host del enlace al dominio canónico (no al host
    // donde se abrió el panel, p. ej. una URL *.vercel.app, que Supabase no tiene
    // en su allowlist y haría caer el redirect al Site URL). En local usamos el
    // origen actual para que el enlace de Mailpit apunte a localhost.
    const origin = process.env.NODE_ENV === "production" ? SITE_URL : window.location.origin;
    // Solo invitados existen (signup off). shouldCreateUser:false evita crear
    // usuarios y enviar enlaces a correos no autorizados.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      console.warn("[admin-login]", error.message);
      // El límite de tasa no revela si el correo existe: sí podemos avisarlo.
      if (error.status === 429) {
        setStatus("ratelimited");
        return;
      }
    }
    // Mensaje genérico siempre: no revelar si el correo está o no autorizado.
    setStatus("sent");
  };

  return (
    <main className="booth-glow flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm border hairline bg-ink/40 p-8">
        <div className="flex items-center gap-2.5">
          <Logo variant="mini" color="gold" height={26} />
          <span className="label text-bone-mute">Admin</span>
        </div>

        <h1 className="font-display mt-6 text-bone" style={{ fontSize: "clamp(1.8rem,5vw,2.4rem)" }}>
          Acceso al panel
        </h1>

        {status === "sent" ? (
          <p className="mt-5 text-sm leading-relaxed text-bone-dim">
            Si <strong className="text-bone">{email}</strong> está autorizado, te enviamos un enlace de acceso. Revisa tu
            correo.
          </p>
        ) : status === "ratelimited" ? (
          <p className="mt-5 text-sm leading-relaxed text-bone-dim">
            Demasiados intentos. Espera unos minutos antes de pedir otro enlace de acceso.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            {callbackFailed && (
              <p className="label-sm text-sirena">
                No pudimos iniciar tu sesión con ese enlace. Pide uno nuevo.
              </p>
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
        )}
      </div>
    </main>
  );
}

export default function AdminLogin() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
