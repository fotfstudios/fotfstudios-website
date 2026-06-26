"use client";

import { useState } from "react";
import Logo from "@/components/Logo";
import { btn, inputCls } from "@/components/admin/ui/styles";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const supabase = createAuthBrowserClient();
    // Solo invitados existen (signup off). shouldCreateUser:false evita crear
    // usuarios y enviar enlaces a correos no autorizados.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setBusy(false);
    // Mensaje genérico siempre: no revelar si el correo está o no autorizado.
    if (error) console.warn("[admin-login]", error.message);
    setSent(true);
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

        {sent ? (
          <p className="mt-5 text-sm leading-relaxed text-bone-dim">
            Si <strong className="text-bone">{email}</strong> está autorizado, te enviamos un enlace de acceso. Revisa tu
            correo.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
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
