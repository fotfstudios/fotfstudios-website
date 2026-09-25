"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { trackNewsletter } from "@/lib/analytics";
import { readUtm } from "@/lib/guia-utm";
import {
  NEWSLETTER_CAPS,
  newsletterErrorMessage,
  newsletterFieldMessage,
  parseNewsletterSubscribe,
} from "@/src/domain/newsletter/subscribe";
import Button from "../_ds/Button";
import Input from "../_ds/Input";

const SOURCE = "curso_dj";

/** "Sigue aprendiendo": email → /api/newsletter. Estados: idle, enviando, error (persistente), listo. */
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = { email, source: SOURCE, website, ...readUtm(window.location, document.referrer) };
    // Misma validación que corre el servidor.
    const parsed = parseNewsletterSubscribe(payload);
    if (parsed.kind === "spam") {
      setDone(true);
      return;
    }
    if (parsed.kind === "invalid") {
      const issue = parsed.issues.find((i) => i.field === "email") ?? parsed.issues[0];
      setFieldError(newsletterFieldMessage(issue.code));
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(newsletterErrorMessage(data?.error));
        return;
      }
      trackNewsletter("submit", SOURCE);
      setDone(true);
      requestAnimationFrame(() => okRef.current?.focus());
    } catch {
      setError(newsletterErrorMessage("network"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        ref={okRef}
        tabIndex={-1}
        role="status"
        className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-6 py-5 outline-none"
      >
        <p className="m-0 text-[17px] font-medium">Listo, quedaste en la lista.</p>
        <p className="ds-mono m-0 text-[15px] text-[var(--text-secondary)]">{email.trim().toLowerCase()}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_260px]">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            autoComplete="email"
            inputRef={inputRef}
            value={email}
            maxLength={NEWSLETTER_CAPS.email}
            error={fieldError ?? undefined}
            onChange={(e) => {
              if (!started.current) {
                started.current = true;
                trackNewsletter("start", SOURCE);
              }
              setEmail(e.target.value);
              setFieldError(null);
            }}
          />
        </div>
        {/* Alineado con el input, no con la etiqueta: la eyebrow mide ~20 px. */}
        <Button type="submit" variant="secondary" size="lg" disabled={submitting} className="sm:mt-[26px]">
          {submitting ? "Enviando…" : "Avísame"}
        </Button>
      </div>

      {/* Honeypot: fuera de pantalla, sin tabIndex, invisible para lectores. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="nl-website">Sitio web</label>
        <input
          id="nl-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <p className="m-0 text-[13px] leading-snug text-[var(--text-muted)]">
        Solo avisos de contenido nuevo. Te das de baja cuando quieras.{" "}
        <Link href="/privacidad" className="underline underline-offset-4 hover:text-[var(--text-primary)]">
          Privacidad
        </Link>
      </p>
    </form>
  );
}
