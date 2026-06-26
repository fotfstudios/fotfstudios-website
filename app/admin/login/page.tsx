"use client";

import { useState } from "react";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="label text-gold">FOTF Studios · Admin</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2rem,6vw,3rem)" }}>
        Ingresar
      </h1>
      {sent ? (
        <p className="mt-6 text-bone-dim">
          Te enviamos un enlace de acceso a <strong className="text-bone">{email}</strong>. Revisa tu correo.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder="tu@email.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border hairline bg-ink px-4 py-3 font-mono text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
          />
          {error && <p className="label-sm text-sirena">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center bg-gold px-6 py-3 label text-ink disabled:opacity-40"
          >
            {busy ? "Enviando…" : "Enviar enlace de acceso"}
          </button>
        </form>
      )}
    </main>
  );
}
