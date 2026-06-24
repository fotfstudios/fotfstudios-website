"use client";

import { useState } from "react";
import Magnetic from "./Magnetic";
import { whatsappLink } from "@/lib/site";
import {
  DAYS,
  quote,
  bookingMessage,
  startOptions,
  maxHours,
  formatCLP,
  formatDuration,
  formatHour,
  BOOKING,
  ADDONS,
} from "@/lib/pricing";

// Orden de presentación: Lun → Dom
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Rec = "none" | "audio" | "audioVideo";

export default function PriceCalculator() {
  const [day, setDay] = useState(1);
  const [start, setStart] = useState(10);
  const [hours, setHours] = useState(1);
  const [coach, setCoach] = useState(false);
  const [coachHours, setCoachHours] = useState(1);
  const [rec, setRec] = useState<Rec>("none");

  const clampCoach = (h: number, maxH: number) =>
    Math.min(Math.max(BOOKING.stepHours, h), maxH);

  const pickDay = (d: number) => {
    const s = startOptions(d)[0];
    const mh = maxHours(d, s);
    const newHours = Math.min(hours, mh);
    setDay(d);
    setStart(s);
    setHours(newHours);
    setCoachHours((c) => clampCoach(c, newHours));
  };

  const pickStart = (s: number) => {
    const mh = maxHours(day, s);
    const newHours = Math.min(hours, mh);
    setStart(s);
    setHours(newHours);
    setCoachHours((c) => clampCoach(c, newHours));
  };

  const stepHours = (dir: 1 | -1) => {
    const mh = maxHours(day, start);
    const next = Math.min(Math.max(BOOKING.minHours, hours + dir * BOOKING.stepHours), mh);
    setHours(next);
    setCoachHours((c) => clampCoach(c, next));
  };

  const stepCoach = (dir: 1 | -1) => {
    setCoachHours((c) => clampCoach(c + dir * BOOKING.stepHours, hours));
  };

  const quoteInput = {
    day,
    start,
    hours,
    coachHours: coach ? coachHours : 0,
    audio: rec === "audio",
    audioVideo: rec === "audioVideo",
  };
  const q = quote(quoteInput);

  const endStr = formatHour(q.end);
  const summaryLine = `${DAYS[day].label} ${formatHour(start)}–${endStr} · ${formatDuration(hours)}`;
  const waMsg = bookingMessage(quoteInput, q);

  const startOpts = startOptions(day);
  const atMaxHours = hours >= maxHours(day, start);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      {/* Controles */}
      <div className="border hairline">
        <div className="flex items-center justify-between border-b hairline px-6 py-4">
          <span className="label text-bone-mute">Arma tu sesión</span>
          <span className="label-sm text-gold">Estimador</span>
        </div>

        <div className="space-y-7 p-6">
          {/* Día */}
          <Field label="Día">
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  aria-pressed={day === d}
                  className={`min-w-11 px-3 py-2 label-sm transition-colors ${
                    day === d
                      ? "bg-gold text-ink"
                      : "border hairline text-bone-dim hover:border-gold hover:text-gold"
                  }`}
                >
                  {DAYS[d].short}
                </button>
              ))}
            </div>
          </Field>

          {/* Hora de inicio */}
          <Field label="Hora de inicio" htmlFor="cal-start">
            <div className="relative">
              <select
                id="cal-start"
                value={start}
                onChange={(e) => pickStart(Number(e.target.value))}
                className="w-full appearance-none border hairline bg-ink px-4 py-3 font-mono text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
              >
                {startOpts.map((s) => (
                  <option key={s} value={s} className="bg-ink">
                    {formatHour(s)}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gold">
                ▾
              </span>
            </div>
          </Field>

          {/* Duración */}
          <Field label="Duración">
            <Stepper
              value={formatDuration(hours)}
              onDec={() => stepHours(-1)}
              onInc={() => stepHours(1)}
              decDisabled={hours <= BOOKING.minHours}
              incDisabled={atMaxHours}
              hint={`Termina ${endStr} · mín 1h · pasos 30min`}
            />
          </Field>

          {/* 1:1 guiado */}
          <Field label="1:1 guiado (add-on)">
            <Toggle
              on={coach}
              onClick={() => setCoach((v) => !v)}
              label={coach ? "Incluido" : "Agregar"}
            />
            {coach && (
              <div className="mt-3">
                <Stepper
                  value={formatDuration(coachHours)}
                  onDec={() => stepCoach(-1)}
                  onInc={() => stepCoach(1)}
                  decDisabled={coachHours <= BOOKING.stepHours}
                  incDisabled={coachHours >= hours}
                  hint="Misma tarifa por hora de la sala · con el descuento aplicado"
                />
              </div>
            )}
          </Field>

          {/* Grabación */}
          <Field label="Grabación (add-on)">
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ["none", "Ninguna", ""],
                ["audio", "Audio", formatCLP(ADDONS.audio.price)],
                ["audioVideo", "A+V", formatCLP(ADDONS.audioVideo.price)],
              ] as [Rec, string, string][]).map(([key, lbl, price]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRec(key)}
                  aria-pressed={rec === key}
                  className={`flex flex-col items-center gap-1 px-2 py-3 transition-colors ${
                    rec === key
                      ? "bg-gold text-ink"
                      : "border hairline text-bone-dim hover:border-gold hover:text-gold"
                  }`}
                >
                  <span className="label-sm">{lbl}</span>
                  {price && <span className="font-mono text-[0.65rem] opacity-80">{price}</span>}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      {/* Resumen */}
      <div className="grain relative overflow-hidden border hairline bg-ink lg:sticky lg:top-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(45% 50% at 100% 0%, rgba(232,201,74,0.12), transparent 60%)" }}
        />
        <div className="relative p-6 md:p-8">
          <span className="label text-bone-mute">Total estimado</span>
          <div className="mt-3 flex items-end gap-2">
            <span className="font-display text-bone" style={{ fontSize: "clamp(2.8rem,9vw,4.5rem)" }}>
              {formatCLP(q.total)}
            </span>
          </div>
          <p className="mt-1 label-sm text-gold">{summaryLine}</p>

          {/* Desglose */}
          <ul className="mt-6 space-y-2.5 border-t hairline pt-5 text-sm">
            {q.tierLines.map((l) => (
              <li key={l.key} className="flex items-baseline justify-between gap-3 text-bone-dim">
                <span>
                  Sala · {formatDuration(l.hours)} <span className="text-bone-mute">({formatCLP(l.rate)}/h)</span>
                </span>
                <span className="font-mono text-bone">{formatCLP(l.subtotal)}</span>
              </li>
            ))}
            {q.addonLines.map((l) => (
              <li key={l.name} className="flex items-baseline justify-between gap-3 text-bone-dim">
                <span>{l.name}</span>
                <span className="font-mono text-bone">{formatCLP(l.amount)}</span>
              </li>
            ))}
            {q.volumePct > 0 && (
              <li className="flex items-baseline justify-between gap-3 text-gold">
                <span>Descuento por volumen ({Math.round(q.volumePct * 100)}%)</span>
                <span className="font-mono">−{formatCLP(q.discount)}</span>
              </li>
            )}
          </ul>

          <div className="mt-5 flex items-baseline justify-between border-t hairline pt-4">
            <span className="label text-bone-mute">Total</span>
            <span className="font-display text-3xl text-bone">{formatCLP(q.total)}</span>
          </div>

          <Magnetic className="mt-6 w-full">
            <a
              href={whatsappLink(waMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform"
            >
              Reservar por WhatsApp
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </Magnetic>
          <p className="mt-3 text-center label-sm text-bone-mute">
            IVA incluido · estimación · confirmas por WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label-sm mb-3 block text-bone-mute">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stepper({
  value,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
  hint,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-stretch border hairline">
        <button
          type="button"
          onClick={onDec}
          disabled={decDisabled}
          aria-label="Restar"
          className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-bone"
        >
          −
        </button>
        <span className="flex flex-1 items-center justify-center border-x hairline py-3 font-display text-2xl text-bone">
          {value}
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={incDisabled}
          aria-label="Sumar"
          className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-bone"
        >
          +
        </button>
      </div>
      {hint && <p className="mt-2 label-sm text-bone-mute">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-3 px-4 py-2.5 label-sm transition-colors ${
        on ? "bg-gold text-ink" : "border hairline text-bone-dim hover:border-gold hover:text-gold"
      }`}
    >
      <span className={`h-2 w-2 ${on ? "bg-ink" : "bg-gold"}`} />
      {label}
    </button>
  );
}
