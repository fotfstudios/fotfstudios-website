"use client";

import { useRef, useState } from "react";
import { trackCourseLead } from "@/lib/analytics";
import { courseErrorMessage, courseFieldMessage } from "@/lib/course-form";
import {
  COURSE_LEAD_CAPS,
  type CourseLeadField,
  parseCourseLead,
} from "@/src/domain/course/lead";
import {
  EXPERIENCE_LABELS_PUBLIC,
  EXPERIENCE_LEVELS,
  LEAD_PLANS,
  LEAD_PLAN_LABELS_PUBLIC,
  type ExperienceLevel,
  type LeadPlan,
} from "@/src/domain/course/course";
import WhatsAppCta from "./WhatsAppCta";

const inputCls =
  "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

type FormState = {
  name: string;
  email: string;
  phone: string;
  plan: LeadPlan | "";
  experience: ExperienceLevel | "";
  availability: string;
  message: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  plan: "",
  experience: "",
  availability: "",
  message: "",
};

/** Orden de foco al primer inválido. */
const FIELD_ORDER: CourseLeadField[] = [
  "name",
  "email",
  "phone",
  "plan",
  "experience",
  "availability",
  "message",
];

export default function InscripcionForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [website, setWebsite] = useState(""); // honeypot
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CourseLeadField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const okRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Partial<Record<CourseLeadField, HTMLElement | null>>>({});

  const set = (k: keyof FormState) => (v: string) => {
    if (!started.current) {
      started.current = true;
      trackCourseLead("start");
    }
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Misma validación que corre el servidor: los mensajes no se pueden desincronizar.
    const parsed = parseCourseLead({ ...form, website });
    if (parsed.kind === "spam") {
      setDone(true); // silencio idéntico al éxito
      return;
    }
    if (parsed.kind === "invalid") {
      const map: Partial<Record<CourseLeadField, string>> = {};
      for (const i of parsed.issues) map[i.field] ??= courseFieldMessage(i.field, i.code);
      setFieldErrors(map);
      const firstBad = FIELD_ORDER.find((f) => map[f]);
      if (firstBad) refs.current[firstBad]?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/curso/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(courseErrorMessage(data?.error));
        return;
      }
      // El evento se dispara SOLO con 200: un submit fallido no es conversión.
      trackCourseLead("submit", form.plan || undefined);
      setDone(true);
      requestAnimationFrame(() => okRef.current?.focus());
    } catch {
      setError(courseErrorMessage("network"));
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
        className="border border-gold bg-ink-soft/50 px-6 py-10 outline-none sm:px-10"
      >
        <p className="label text-gold">Solicitud enviada</p>
        <p className="font-display mt-3 text-4xl text-bone md:text-5xl">Listo. Te escribimos.</p>
        <p className="mt-5 max-w-lg leading-relaxed text-bone-dim">
          Te mandamos un correo a <span className="text-bone">{form.email}</span>. Revisamos cada
          solicitud a mano y te contactamos por WhatsApp para cerrar tu cupo y coordinar las fechas.
        </p>
        {/* Quien acaba de enviar bien y AUN ASÍ se va a WhatsApp está diciendo que
            no le creyó a este panel: si `inscripcion-ok` no es cero, el copy de
            confirmación no tranquiliza lo suficiente. */}
        <WhatsAppCta
          source="inscripcion-ok"
          className="label mt-8 inline-block border border-gold px-6 py-3 text-gold transition-colors hover:bg-gold hover:text-ink"
        >
          Escríbenos por WhatsApp →
        </WhatsAppCta>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Campo label="Nombre" error={fieldErrors.name}>
          <input
            ref={(el) => { refs.current.name = el; }}
            className={`${inputCls} ${fieldErrors.name ? "border-sirena" : ""}`}
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            maxLength={COURSE_LEAD_CAPS.name}
            autoComplete="name"
            aria-invalid={!!fieldErrors.name}
          />
        </Campo>
        <Campo label="Email" error={fieldErrors.email}>
          <input
            ref={(el) => { refs.current.email = el; }}
            type="email"
            className={`${inputCls} ${fieldErrors.email ? "border-sirena" : ""}`}
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            maxLength={COURSE_LEAD_CAPS.email}
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
          />
        </Campo>
      </div>

      <Campo label="WhatsApp" error={fieldErrors.phone}>
        <input
          ref={(el) => { refs.current.phone = el; }}
          type="tel"
          className={`${inputCls} ${fieldErrors.phone ? "border-sirena" : ""}`}
          placeholder="+56 9 …"
          value={form.phone}
          onChange={(e) => set("phone")(e.target.value)}
          maxLength={COURSE_LEAD_CAPS.phone}
          autoComplete="tel"
          aria-invalid={!!fieldErrors.phone}
        />
      </Campo>

      <Chips
        label="¿Qué te interesa?"
        error={fieldErrors.plan}
        options={LEAD_PLANS.map((p) => ({ value: p, label: LEAD_PLAN_LABELS_PUBLIC[p] }))}
        value={form.plan}
        onChange={set("plan")}
        firstRef={(el) => { refs.current.plan = el; }}
      />

      <Chips
        label="¿Desde dónde partes?"
        error={fieldErrors.experience}
        options={EXPERIENCE_LEVELS.map((p) => ({ value: p, label: EXPERIENCE_LABELS_PUBLIC[p] }))}
        value={form.experience}
        onChange={set("experience")}
        firstRef={(el) => { refs.current.experience = el; }}
      />

      <Campo label="Disponibilidad" error={fieldErrors.availability}>
        <input
          ref={(el) => { refs.current.availability = el; }}
          className={`${inputCls} ${fieldErrors.availability ? "border-sirena" : ""}`}
          placeholder="Ej: tardes de semana, sábados en la mañana"
          value={form.availability}
          onChange={(e) => set("availability")(e.target.value)}
          maxLength={COURSE_LEAD_CAPS.availability}
          aria-invalid={!!fieldErrors.availability}
        />
      </Campo>

      <Campo label="¿Algo que debamos saber?" hint="Opcional" error={fieldErrors.message}>
        <textarea
          ref={(el) => { refs.current.message = el; }}
          className={`${inputCls} min-h-28 resize-y`}
          value={form.message}
          onChange={(e) => set("message")(e.target.value)}
          maxLength={COURSE_LEAD_CAPS.message}
          aria-invalid={!!fieldErrors.message}
        />
      </Campo>

      {/* Honeypot: fuera de pantalla, sin tabIndex, invisible para lectores. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="ci-website">Sitio web</label>
        <input
          id="ci-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="label-sm text-sirena">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <button
          type="submit"
          disabled={submitting}
          className="label border border-gold px-8 py-4 text-gold transition-colors hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Enviando…" : "Quiero mi cupo →"}
        </button>
        {/* Puerta de salida hacia el chat, deliberadamente secundaria frente al
            botón. Medirla contra `course_lead_start` dice si el formulario pide
            demasiado o si este link está demasiado a mano. */}
        <WhatsAppCta
          source="inscripcion-alternativa"
          className="label-sm text-bone-mute underline decoration-bone-mute/40 underline-offset-4 transition-colors hover:text-gold"
        >
          o escríbenos por WhatsApp
        </WhatsAppCta>
      </div>
      <p className="label-sm text-bone-mute">Te respondemos por WhatsApp · sin spam, sin listas.</p>
    </form>
  );
}

function Campo({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-sm text-bone-mute">
        {label}
        {hint && <span className="ml-2 text-bone-mute/60">{hint}</span>}
      </span>
      {children}
      {error && <span className="label-sm text-sirena">{error}</span>}
    </label>
  );
}

/**
 * Grupo de chips en vez de <select>: son 3–4 opciones cortas y el toque en móvil
 * gana. `aria-pressed` mantiene el estado audible para lectores de pantalla.
 */
function Chips({
  label,
  error,
  options,
  value,
  onChange,
  firstRef,
}: {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  firstRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label-sm mb-1 text-bone-mute">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`label-sm border px-4 py-2.5 transition-colors ${
                on ? "border-gold bg-gold/10 text-gold" : "hairline text-bone-dim hover:border-gold hover:text-bone"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <span className="label-sm text-sirena">{error}</span>}
    </fieldset>
  );
}
