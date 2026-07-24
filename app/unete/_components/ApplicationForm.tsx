"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  APPLICATION_CAPS,
  type ApplicationField,
  SESSION_FORMATS,
  SESSION_FORMAT_LABELS,
  type SessionFormat,
  parseApplication,
} from "@/src/domain/applications/application";
import { applicationErrorMessage, applicationFieldMessage } from "@/lib/application-form";

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

type FormState = {
  name: string;
  email: string;
  phone: string;
  format: SessionFormat | "";
  availability: string;
  mixUrl: string;
  instagram: string;
  genres: string;
  pitch: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  format: "",
  availability: "",
  mixUrl: "",
  instagram: "",
  genres: "",
  pitch: "",
};

/** Orden de foco al primer inválido. */
const FIELD_ORDER: ApplicationField[] = [
  "name",
  "email",
  "phone",
  "format",
  "availability",
  "mixUrl",
  "instagram",
  "genres",
  "pitch",
];

export default function ApplicationForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [website, setWebsite] = useState(""); // honeypot
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ApplicationField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sentEmail) successRef.current?.focus();
  }, [sentEmail]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Misma validación que el servidor (parseApplication corre en ambos lados).
    const parsed = parseApplication({ ...form, website });
    if (parsed.kind === "invalid") {
      const errs: Partial<Record<ApplicationField, string>> = {};
      for (const iss of parsed.issues) {
        if (!errs[iss.field]) errs[iss.field] = applicationFieldMessage(iss.field, iss.code);
      }
      setFieldErrors(errs);
      const firstBad = FIELD_ORDER.find((f) => errs[f]);
      if (firstBad) document.getElementById(`ap-${firstBad}`)?.focus();
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(applicationErrorMessage(data?.error));
        setSubmitting(false);
        return;
      }
      setSentEmail(form.email.trim().toLowerCase());
    } catch {
      setError(applicationErrorMessage("network"));
      setSubmitting(false);
    }
  }

  if (sentEmail) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="border hairline p-6 outline-none md:p-8"
      >
        <p className="label text-gold">Postulación enviada</p>
        <h2 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(1.6rem,5vw,2.4rem)" }}>
          Listo. Te leemos.
        </h2>
        <p className="mt-4 leading-relaxed text-bone-dim">
          Te enviamos un correo de confirmación a{" "}
          <strong className="text-bone">{sentEmail}</strong>. Revisamos cada postulación y, si calza, te
          contactamos por WhatsApp para coordinar clases o sesiones 1:1.
        </p>
        <Link
          href="/"
          className="label-sm mt-6 inline-block text-bone-mute transition-colors hover:text-gold"
        >
          ← Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-6">
      {/* Honeypot: fuera de pantalla (no sr-only), fuera del tab y de AT. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="ap-website">Sitio web</label>
        <input
          id="ap-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <TextField
        field="name"
        label="Nombre *"
        value={form.name}
        onChange={set("name")}
        error={fieldErrors.name}
        autoComplete="name"
        placeholder="Tu nombre"
      />
      <TextField
        field="email"
        label="Email *"
        type="email"
        inputMode="email"
        value={form.email}
        onChange={set("email")}
        error={fieldErrors.email}
        autoComplete="email"
        placeholder="tu@correo.cl"
      />
      <TextField
        field="phone"
        label="WhatsApp *"
        type="tel"
        inputMode="tel"
        value={form.phone}
        onChange={set("phone")}
        error={fieldErrors.phone}
        autoComplete="tel"
        placeholder="+56 9 …"
      />

      {/* Formato: clases grupales / 1:1 / ambas — el corazón del rol docente. */}
      <fieldset id="ap-format" tabIndex={-1} className="outline-none">
        <legend className="label-sm mb-3 block text-bone-mute">¿Qué te gustaría hacer? *</legend>
        <div className="flex flex-wrap gap-2">
          {SESSION_FORMATS.map((f) => {
            const active = form.format === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setForm((s) => ({ ...s, format: f }))}
                className={`label-sm border px-4 py-2.5 transition-colors ${
                  active ? "border-gold bg-gold text-ink" : "hairline text-bone-dim hover:border-gold hover:text-gold"
                }`}
              >
                {SESSION_FORMAT_LABELS[f]}
              </button>
            );
          })}
        </div>
        {fieldErrors.format && (
          <p id="ap-format-error" className="label-sm mt-2 text-sirena">
            {fieldErrors.format}
          </p>
        )}
      </fieldset>

      <TextField
        field="availability"
        label="Disponibilidad *"
        value={form.availability}
        onChange={set("availability")}
        error={fieldErrors.availability}
        placeholder="Ej: tardes de semana, sábados AM"
      />
      <TextField
        field="mixUrl"
        label="Link a un set *"
        type="url"
        inputMode="url"
        value={form.mixUrl}
        onChange={set("mixUrl")}
        error={fieldErrors.mixUrl}
        placeholder="https://soundcloud.com/…"
      />
      <TextField
        field="instagram"
        label="Instagram"
        value={form.instagram}
        onChange={set("instagram")}
        error={fieldErrors.instagram}
        placeholder="@tuusuario"
      />
      <TextField
        field="genres"
        label="Géneros"
        value={form.genres}
        onChange={set("genres")}
        error={fieldErrors.genres}
        placeholder="House, techno, …"
      />

      <div>
        <label htmlFor="ap-pitch" className="label-sm mb-3 block text-bone-mute">
          Tu experiencia enseñando *
        </label>
        <textarea
          id="ap-pitch"
          rows={5}
          maxLength={APPLICATION_CAPS.pitch}
          value={form.pitch}
          onChange={set("pitch")}
          aria-invalid={fieldErrors.pitch ? true : undefined}
          aria-describedby={fieldErrors.pitch ? "ap-pitch-error" : undefined}
          className={`${inputCls} resize-y ${fieldErrors.pitch ? "border-sirena" : ""}`}
          placeholder="¿Has hecho clases o guiado a alguien antes? Cuéntanos tu experiencia y cómo te gusta enseñar."
        />
        <p className="label-sm mt-1 text-bone-mute">
          {form.pitch.length} / {APPLICATION_CAPS.pitch}
        </p>
        {fieldErrors.pitch && (
          <p id="ap-pitch-error" className="label-sm mt-1 text-sirena">
            {fieldErrors.pitch}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="label-sm text-sirena">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
      >
        {submitting ? "Enviando…" : "Enviar postulación"}
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

function TextField({
  field,
  label,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
}: {
  field: ApplicationField;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  type?: string;
  inputMode?: "email" | "tel" | "url";
  autoComplete?: string;
  placeholder?: string;
}) {
  const cap = field in APPLICATION_CAPS ? APPLICATION_CAPS[field as keyof typeof APPLICATION_CAPS] : undefined;
  return (
    <div>
      <label htmlFor={`ap-${field}`} className="label-sm mb-3 block text-bone-mute">
        {label}
      </label>
      <input
        id={`ap-${field}`}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={cap}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `ap-${field}-error` : undefined}
        className={`${inputCls} ${error ? "border-sirena" : ""}`}
      />
      {error && (
        <p id={`ap-${field}-error`} className="label-sm mt-1 text-sirena">
          {error}
        </p>
      )}
    </div>
  );
}
