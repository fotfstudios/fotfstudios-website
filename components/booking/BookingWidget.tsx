"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCLP } from "@/src/domain/money/money";
import { availableStartMinutes, type Interval } from "@/src/domain/scheduling/availability";

type Rec = "none" | "audio" | "audioVideo";

interface DayAvailability {
  closed: boolean;
  openMinute: number;
  closeMinute: number;
  booked: Interval[];
}

interface QuoteResult {
  total: number;
  tierLines: { key: string; hours: number; rate: number; subtotal: number }[];
  addonLines: { key: string; name: string; amount: number }[];
  discount: number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const todayInSantiago = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export default function BookingWidget({ resourceId }: { resourceId: string }) {
  const [date, setDate] = useState(todayInSantiago());
  const [avail, setAvail] = useState<DayAvailability | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [rec, setRec] = useState<Rec>("none");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disponibilidad al cambiar de fecha.
  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoadingAvail(true);
      setStart(null);
      setQuote(null);
      try {
        const d = await (await fetch(`/api/availability?resource=${resourceId}&date=${date}`)).json();
        if (active) setAvail(d?.error ? null : d);
      } catch {
        if (active) setAvail(null);
      } finally {
        if (active) setLoadingAvail(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [resourceId, date]);

  const starts =
    avail && !avail.closed
      ? availableStartMinutes(avail.openMinute, avail.closeMinute, duration, avail.booked)
      : [];
  // Inicio efectivo: si tras cambiar duración deja de ser válido, se ignora.
  const selectedStart = start !== null && starts.includes(start) ? start : null;
  const maxDuration =
    avail && !avail.closed && selectedStart !== null ? (avail.closeMinute - selectedStart) / 60 : 8;

  // Cotización (estimación) cuando hay inicio válido.
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (selectedStart === null) {
        if (active) setQuote(null);
        return;
      }
      const keys = rec === "none" ? [] : [rec];
      const qs = new URLSearchParams({
        resource: resourceId,
        date,
        start: String(selectedStart),
        duration: String(duration),
        addons: keys.join(","),
      });
      try {
        const d = await (await fetch(`/api/pricing/quote?${qs}`)).json();
        if (active) setQuote(d?.error ? null : d);
      } catch {
        if (active) setQuote(null);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [resourceId, date, selectedStart, duration, rec]);

  const submit = useCallback(async () => {
    if (selectedStart === null || !email) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date,
          startMinute: selectedStart,
          durationHours: duration,
          addonKeys: rec === "none" ? [] : [rec],
          customer: { name, email, phone },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "slot_taken"
            ? "Ese horario se acaba de tomar. Elige otro."
            : "No se pudo crear la reserva.",
        );
        setSubmitting(false);
        return;
      }
      window.location.assign(data.initPoint);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setSubmitting(false);
    }
  }, [resourceId, date, selectedStart, duration, rec, name, email, phone]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      {/* Controles */}
      <div className="border hairline">
        <div className="flex items-center justify-between border-b hairline px-6 py-4">
          <span className="label text-bone-mute">Reserva tu sesión</span>
          <span className="label-sm text-gold">Sala de ensayo</span>
        </div>

        <div className="space-y-7 p-6">
          <Field label="Día">
            <input
              type="date"
              value={date}
              min={todayInSantiago()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border hairline bg-ink px-4 py-3 font-mono text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
            />
          </Field>

          <Field label="Hora de inicio">
            {loadingAvail ? (
              <p className="label-sm text-bone-mute">Cargando disponibilidad…</p>
            ) : avail?.closed ? (
              <p className="label-sm text-bone-mute">Cerrado ese día.</p>
            ) : starts.length === 0 ? (
              <p className="label-sm text-bone-mute">Sin horarios disponibles para esa duración.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {starts.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setStart(m)}
                    aria-pressed={selectedStart === m}
                    className={`min-w-16 px-3 py-2 label-sm transition-colors ${
                      selectedStart === m
                        ? "bg-gold text-ink"
                        : "border hairline text-bone-dim hover:border-gold hover:text-gold"
                    }`}
                  >
                    {hhmm(m)}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="Duración">
            <div className="flex items-stretch border hairline">
              <button
                type="button"
                onClick={() => setDuration((d) => Math.max(1, d - 1))}
                disabled={duration <= 1}
                aria-label="Restar"
                className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25"
              >
                −
              </button>
              <span className="flex flex-1 items-center justify-center border-x hairline py-3 font-display text-2xl text-bone">
                {duration}h
              </span>
              <button
                type="button"
                onClick={() => setDuration((d) => Math.min(maxDuration, d + 1))}
                disabled={duration >= maxDuration}
                aria-label="Sumar"
                className="w-12 shrink-0 font-display text-2xl text-bone transition-colors hover:bg-ink-soft hover:text-gold disabled:opacity-25"
              >
                +
              </button>
            </div>
          </Field>

          <Field label="Grabación (opcional)">
            <div className="grid grid-cols-3 gap-1.5">
              {(["none", "audio", "audioVideo"] as Rec[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRec(k)}
                  aria-pressed={rec === k}
                  className={`px-2 py-3 label-sm transition-colors ${
                    rec === k ? "bg-gold text-ink" : "border hairline text-bone-dim hover:border-gold hover:text-gold"
                  }`}
                >
                  {k === "none" ? "Ninguna" : k === "audio" ? "Audio" : "Audio + Video"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Tus datos">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
              />
              <input
                type="email"
                placeholder="Email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
              />
              <input
                type="tel"
                placeholder="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold"
              />
            </div>
          </Field>
        </div>
      </div>

      {/* Resumen */}
      <div className="grain relative overflow-hidden border hairline bg-ink lg:sticky lg:top-28">
        <div className="relative p-6 md:p-8">
          <span className="label text-bone-mute">Total</span>
          <div className="mt-3 font-display text-bone" style={{ fontSize: "clamp(2.6rem,8vw,4rem)" }}>
            {quote ? formatCLP(quote.total) : "—"}
          </div>
          {selectedStart !== null && (
            <p className="mt-1 label-sm text-gold">
              {date} · {hhmm(selectedStart)}–{hhmm(selectedStart + duration * 60)} · {duration}h
            </p>
          )}

          {quote && (
            <ul className="mt-6 space-y-2.5 border-t hairline pt-5 text-sm">
              {quote.tierLines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3 text-bone-dim">
                  <span>Sala · {l.hours}h</span>
                  <span className="font-mono text-bone">{formatCLP(l.subtotal)}</span>
                </li>
              ))}
              {quote.addonLines.map((a) => (
                <li key={a.key} className="flex justify-between gap-3 text-bone-dim">
                  <span>{a.name}</span>
                  <span className="font-mono text-bone">{formatCLP(a.amount)}</span>
                </li>
              ))}
              {quote.discount < 0 && (
                <li className="flex justify-between gap-3 text-gold">
                  <span>Descuento</span>
                  <span className="font-mono">{formatCLP(quote.discount)}</span>
                </li>
              )}
            </ul>
          )}

          {error && <p className="mt-4 label-sm text-sirena">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={selectedStart === null || !email || submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
          >
            {submitting ? "Redirigiendo…" : "Ir a pagar"}
            <span>→</span>
          </button>
          <p className="mt-3 text-center label-sm text-bone-mute">
            IVA incluido · pago seguro con Mercado Pago
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-sm mb-3 block text-bone-mute">{label}</label>
      {children}
    </div>
  );
}
