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
  LEAD_PLAN_LABELS_PUBLIC,
  type ExperienceLevel,
  type LeadPlan,
} from "@/src/domain/course/course";
import { formatCLP } from "@/lib/pricing";
import { PRECIOS } from "@/lib/curso-content";
import Button from "../_ds/Button";
import Faders from "../_ds/Faders";
import Input, { Textarea } from "../_ds/Input";
import WhatsAppCta from "./WhatsAppCta";

/** La prueba primero: es la puerta de entrada que vende la página. */
const PLAN_ORDER: LeadPlan[] = ["prueba", "individual", "duo", "no_se"];

/** Lo que muestra la fila de resumen según el plan elegido. */
const PLAN_PRICE: Record<LeadPlan, string | null> = {
  prueba: formatCLP(PRECIOS.prueba),
  individual: formatCLP(PRECIOS.individual),
  duo: `${formatCLP(PRECIOS.duo)} c/u`,
  no_se: null,
};

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
  "plan",
  "availability",
  "name",
  "email",
  "phone",
  "experience",
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
        className="flex flex-col gap-3.5 rounded-[var(--radius-md)] border border-[var(--accent)] px-6 py-7 outline-none"
      >
        <Faders size={40} />
        <p className="ds-display m-0 text-4xl">Te escribimos</p>
        <p className="m-0 text-[15px] leading-normal text-[var(--text-secondary)]">
          Gracias, {form.name.trim().split(/\s+/)[0]}. Te mandamos un correo a{" "}
          <span className="ds-mono text-[var(--text-primary)]">{form.email}</span>. Revisamos cada
          solicitud a mano y te contactamos por WhatsApp para coordinar tus fechas.
        </p>
        {/* Quien acaba de enviar bien y AUN ASÍ se va a WhatsApp está diciendo que
            no le creyó a este panel: si `inscripcion-ok` no es cero, el copy de
            confirmación no tranquiliza lo suficiente. */}
        <div>
          <WhatsAppCta source="inscripcion-ok" className="ds-btn ds-btn--secondary ds-btn--sm">
            Escríbenos por WhatsApp
          </WhatsAppCta>
        </div>
      </div>
    );
  }

  const precio = form.plan ? PLAN_PRICE[form.plan] : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-7">
      <Paso n={1} label="¿Qué quieres?">
        <Pills
          name="plan"
          legend="¿Qué quieres?"
          error={fieldErrors.plan}
          options={PLAN_ORDER.map((p) => ({ value: p, label: LEAD_PLAN_LABELS_PUBLIC[p] }))}
          value={form.plan}
          onChange={set("plan")}
          firstRef={(el) => { refs.current.plan = el; }}
        />
      </Paso>

      <Paso n={2} label="¿Cuándo te acomoda?">
        <Input
          label="Días y horarios"
          placeholder="Ej: martes o jueves en la tarde, sábados en la mañana"
          inputRef={(el) => { refs.current.availability = el; }}
          value={form.availability}
          onChange={(e) => set("availability")(e.target.value)}
          maxLength={COURSE_LEAD_CAPS.availability}
          error={fieldErrors.availability}
        />
      </Paso>

      <Paso n={3} label="Tus datos">
        <div className="flex flex-col gap-3.5">
          <Input
            label="Nombre"
            placeholder="Tu nombre"
            inputRef={(el) => { refs.current.name = el; }}
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            maxLength={COURSE_LEAD_CAPS.name}
            autoComplete="name"
            error={fieldErrors.name}
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              placeholder="tu@email.com"
              inputRef={(el) => { refs.current.email = el; }}
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              maxLength={COURSE_LEAD_CAPS.email}
              autoComplete="email"
              error={fieldErrors.email}
            />
            <Input
              label="WhatsApp"
              type="tel"
              mono
              placeholder="+56 9 1234 5678"
              inputRef={(el) => { refs.current.phone = el; }}
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              maxLength={COURSE_LEAD_CAPS.phone}
              autoComplete="tel"
              error={fieldErrors.phone}
            />
          </div>
          <Pills
            name="experience"
            legend="¿Has tocado antes?"
            showLegend
            error={fieldErrors.experience}
            options={EXPERIENCE_LEVELS.map((p) => ({ value: p, label: EXPERIENCE_LABELS_PUBLIC[p] }))}
            value={form.experience}
            onChange={set("experience")}
            firstRef={(el) => { refs.current.experience = el; }}
          />
          <Textarea
            label="¿Algo que debamos saber?"
            hint="Opcional"
            textareaRef={(el) => { refs.current.message = el; }}
            value={form.message}
            onChange={(e) => set("message")(e.target.value)}
            maxLength={COURSE_LEAD_CAPS.message}
            error={fieldErrors.message}
          />
        </div>
      </Paso>

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

      <div className="flex flex-col gap-2.5 border-t border-[var(--border-strong)] pt-5">
        <div className="ds-mono flex justify-between gap-3 text-[15px]">
          <span className="text-[var(--text-secondary)]">
            {form.plan ? LEAD_PLAN_LABELS_PUBLIC[form.plan] : "Elige qué quieres"}
          </span>
          {precio && <span>{precio}</span>}
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" glow fullWidth disabled={submitting}>
          {submitting ? "Enviando…" : "Enviar solicitud"}
        </Button>
        <p className="m-0 text-[13px] leading-snug text-[var(--text-muted)]">
          No se paga nada acá. Revisamos tu solicitud y te escribimos por WhatsApp para confirmar
          el día y la hora.{" "}
          {/* Puerta de salida hacia el chat, deliberadamente secundaria frente al
              botón. Medirla contra `course_lead_start` dice si el formulario pide
              demasiado o si este link está demasiado a mano. */}
          <WhatsAppCta
            source="inscripcion-alternativa"
            className="text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--accent)]"
          >
            O escríbenos directo por WhatsApp
          </WhatsAppCta>
        </p>
      </div>
    </form>
  );
}

function Paso({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p aria-hidden="true" className="ds-eyebrow m-0 text-[var(--text-secondary)]">
        {n} · {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Selección única como radios nativos con piel de pill: flechas del teclado, foco y
 * anuncio de estado vienen del navegador. Son 3–4 opciones cortas; en móvil el toque
 * gana a un <select>.
 */
function Pills({
  name,
  legend,
  showLegend = false,
  error,
  options,
  value,
  onChange,
  firstRef,
}: {
  name: string;
  legend: string;
  showLegend?: boolean;
  error?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  firstRef: (el: HTMLInputElement | null) => void;
}) {
  const errId = `ci-${name}-err`;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={error ? errId : undefined}>
      <legend className={showLegend ? "ds-eyebrow mb-2 p-0 text-[var(--text-secondary)]" : "sr-only"}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <label key={o.value} className="ds-pill inline-flex items-center">
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name={`ci-${name}`}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <span id={errId} className="text-[13px] text-[var(--danger)]">
          {error}
        </span>
      )}
    </fieldset>
  );
}
