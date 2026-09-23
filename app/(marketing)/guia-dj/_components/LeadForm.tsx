"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { trackGuideLead } from "@/lib/analytics";
import { COPY } from "@/lib/guia-content";
import { guiaErrorMessage, guiaFieldMessage } from "@/lib/guia-form";
import { GUIDE_LEAD_CAPS, parseGuideLead } from "@/src/domain/guide/lead";
import { GUIDES, type GuideSlug } from "@/lib/guides";
import { readUtm } from "@/lib/guia-utm";
import { useGuiaLead } from "./LeadState";

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors placeholder:text-bone-quiet hover:border-gold focus-visible:border-gold";

/**
 * El único formulario de la landing, tres veces (hero, fragmento, cierre). `source` viaja
 * al route (qué formulario convierte) y a analytics. El botón es Sirena a propósito: es
 * EL momento de conversión de la página — la única urgencia real que hay acá.
 */
export default function LeadForm({
  guide,
  source,
  layout,
  buttonLabel,
  eyebrow,
}: {
  /** A qué guía pertenece este formulario. Viaja al route y a analytics. */
  guide: GuideSlug;
  source: string;
  /** `inline` = campo y botón en una fila (hero); `stack` = apilados (fragmento, cierre). */
  layout: "inline" | "stack";
  buttonLabel: string;
  eyebrow?: string;
}) {
  const { sent, markSent } = useGuiaLead();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);
  const okRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `guia-email-${source}`;

  const onChange = (v: string) => {
    if (!started.current) {
      started.current = true;
      trackGuideLead("start", guide, source);
    }
    setEmail(v);
    setFieldError(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Misma validación que corre el servidor: los mensajes no se pueden desincronizar.
    const parsed = parseGuideLead(
      { email, source, guide, website },
      { slug: guide, sources: GUIDES[guide].sources.map((f) => f.id) },
    );
    if (parsed.kind === "spam") {
      markSent(email); // silencio idéntico al éxito
      return;
    }
    if (parsed.kind === "invalid") {
      const issue = parsed.issues.find((i) => i.field === "email") ?? parsed.issues[0];
      setFieldError(guiaFieldMessage(issue.field, issue.code));
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/guia/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Los UTM se leen ACÁ, al enviar: pertenecen a la sesión con la que la persona
        // llegó, no a la página, y leerlos al montar abriría una diferencia server/cliente.
        body: JSON.stringify({
          email,
          source,
          guide,
          website,
          ...readUtm(window.location, document.referrer),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(guiaErrorMessage(data?.error));
        return;
      }
      // El evento se dispara SOLO con 200: un submit fallido no es conversión.
      trackGuideLead("submit", guide, source);
      markSent(parsed.value.email);
      requestAnimationFrame(() => okRef.current?.focus());
    } catch {
      setError(guiaErrorMessage("network"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div ref={okRef} tabIndex={-1} role="status" className="flex flex-col gap-2 outline-none">
        <p className="label text-gold">{COPY.form.success.label}</p>
        <p className="font-display text-3xl text-bone md:text-4xl">{COPY.form.success.title}</p>
        <p className="max-w-md leading-relaxed text-bone-dim">
          {COPY.form.success.body} Lo mandamos a <span className="text-bone">{sent}</span>.
        </p>
      </div>
    );
  }

  const stacked = layout === "stack";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {eyebrow && <p className="label text-bone-dim">{eyebrow}</p>}

      <div className={stacked ? "flex flex-col gap-3" : "flex flex-wrap gap-3"}>
        <label htmlFor={id} className={`flex flex-col gap-2 ${stacked ? "" : "min-w-0 flex-[1_1_200px]"}`}>
          <span className="sr-only">Tu correo</span>
          <input
            ref={inputRef}
            id={id}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            placeholder={COPY.form.placeholder}
            maxLength={GUIDE_LEAD_CAPS.email}
            value={email}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${id}-error` : undefined}
            className={`${inputCls} ${fieldError ? "border-sirena" : ""}`}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className={`label inline-flex items-center justify-center bg-sirena px-7 text-ink transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60 ${
            stacked ? "w-full py-4" : "min-w-0 flex-[1_1_170px] py-3"
          }`}
        >
          {submitting ? "Enviando…" : buttonLabel}
        </button>
      </div>

      {fieldError && (
        <p id={`${id}-error`} role="alert" className="label-sm text-sirena">
          {fieldError}
        </p>
      )}
      {error && (
        <p role="alert" className="label-sm text-sirena">
          {error}
        </p>
      )}

      {/* Honeypot: fuera de pantalla, sin tabulación; un humano nunca lo ve ni lo llena. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Sitio web
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <p className="label-sm text-bone-mute">
        {COPY.form.finePrint}{" "}
        <Link href="/privacidad" className="underline decoration-bone/30 underline-offset-4 transition-colors hover:text-gold">
          {COPY.form.privacyLink}
        </Link>
      </p>
    </form>
  );
}
