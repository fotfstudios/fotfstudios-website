"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { formatCLP } from "@/src/domain/money/money";
import { availableStartMinutes, type Interval } from "@/src/domain/scheduling/availability";
import type { DayStatus } from "@/src/domain/scheduling/month-availability";
import Calendar from "./Calendar";
import TimeSlots from "./TimeSlots";
import Skeleton from "./Skeleton";
import { hhmm } from "./format";

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

const todayInSantiago = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

/** Minuto del día actual en Santiago (para descartar horarios ya pasados hoy). */
const nowMinuteInSantiago = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
};

export default function BookingWidget({ resourceId }: { resourceId: string }) {
  const today = todayInSantiago();
  const maxDate = DateTime.fromISO(today).plus({ days: 90 }).toFormat("yyyy-MM-dd");

  const [month, setMonth] = useState(today.slice(0, 7));
  const [dayStatus, setDayStatus] = useState<Record<string, DayStatus>>({});
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
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

  // Disponibilidad del mes visible (pinta el calendario). Degrada a {} si falla.
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingMonth(true);
      try {
        const d = await (await fetch(`/api/availability/month?resource=${resourceId}&month=${month}`)).json();
        const days = (d?.days ?? {}) as Record<string, DayStatus>;
        if (active) {
          setDayStatus(days);
          // Si el mes visible no tiene ningún día seleccionable, salta al siguiente
          // (hasta el horizonte): evita aterrizar en un calendario muerto a fin de mes.
          const maxMonth = maxDate.slice(0, 7);
          const hasSelectable = Object.entries(days).some(
            ([date, status]) => date >= today && date <= maxDate && status !== "closed" && status !== "full",
          );
          if (!hasSelectable && Object.keys(days).length > 0 && month < maxMonth) {
            setMonth(DateTime.fromISO(`${month}-01`).plus({ months: 1 }).toFormat("yyyy-MM"));
          }
        }
      } catch {
        if (active) setDayStatus({});
      } finally {
        if (active) setLoadingMonth(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, month, today, maxDate]);

  // Disponibilidad del día al elegir fecha.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (selected === null) {
        if (active) setAvail(null);
        return;
      }
      setLoadingAvail(true);
      setStart(null);
      setQuote(null);
      try {
        const d = await (await fetch(`/api/availability?resource=${resourceId}&date=${selected}`)).json();
        if (active) setAvail(d?.error ? null : d);
      } catch {
        if (active) setAvail(null);
      } finally {
        if (active) setLoadingAvail(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [resourceId, selected]);

  // Si la fecha elegida es hoy, descarta los horarios cuya hora ya pasó.
  const minStart = selected === today ? nowMinuteInSantiago() : 0;
  const starts =
    avail && !avail.closed
      ? availableStartMinutes(avail.openMinute, avail.closeMinute, duration, avail.booked, 60, minStart)
      : [];
  const selectedStart = start !== null && starts.includes(start) ? start : null;
  const maxDuration =
    avail && !avail.closed && selectedStart !== null ? (avail.closeMinute - selectedStart) / 60 : 8;

  // Cotización al tener inicio válido.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (selected === null || selectedStart === null) {
        if (active) setQuote(null);
        return;
      }
      const keys = rec === "none" ? [] : [rec];
      const qs = new URLSearchParams({
        resource: resourceId,
        date: selected,
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
    })();
    return () => {
      active = false;
    };
  }, [resourceId, selected, selectedStart, duration, rec]);

  const submit = useCallback(async () => {
    if (selected === null || selectedStart === null || !email) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resourceId,
          date: selected,
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
            : data?.error === "slot_in_past"
              ? "Ese horario ya pasó. Elige otro."
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
  }, [resourceId, selected, selectedStart, duration, rec, name, email, phone]);

  const canPay = selectedStart !== null && !!email && !submitting;
  const quoting = selectedStart !== null && !quote;
  const inputCls =
    "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:pb-0">
      {/* IZQUIERDA: 1 duración · 2 fecha · 3 hora · 4 grabación */}
      <div className="space-y-6">
        {/* 1. Duración */}
        <div className="border hairline p-5">
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
        </div>

        {/* 2 + 3. Calendario + horarios */}
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <Calendar
            month={month}
            today={today}
            maxDate={maxDate}
            selected={selected}
            dayStatus={dayStatus}
            loading={loadingMonth}
            onSelect={setSelected}
            onMonth={setMonth}
          />
          <div className="border hairline p-4 md:min-h-[20rem] md:p-5">
            <span className="label-sm mb-4 block text-bone-mute">Selecciona un horario</span>
            <TimeSlots
              hasDate={selected !== null}
              loading={loadingAvail}
              closed={!!avail?.closed}
              durationHours={duration}
              slots={starts}
              selected={selectedStart}
              onSelect={setStart}
            />
          </div>
        </div>

        {/* 4. Grabación (opcional) */}
        <div className="border hairline p-5">
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
        </div>
      </div>

      {/* DERECHA: resumen → desglose → tus datos → pago */}
      <div className="grain relative overflow-hidden border hairline bg-ink lg:sticky lg:top-28">
        <div className="relative p-6 md:p-8">
          <span className="label text-bone-mute">Total</span>
          {quote ? (
            <div className="mt-3 font-display text-bone" style={{ fontSize: "clamp(2.6rem,8vw,4rem)" }}>
              {formatCLP(quote.total)}
            </div>
          ) : quoting ? (
            <Skeleton className="mt-3 h-12 w-44 md:h-14" />
          ) : (
            <p className="mt-3 label-sm text-bone-mute">Selecciona un horario para ver el total.</p>
          )}
          {selected !== null && selectedStart !== null && (
            <p className="mt-1 label-sm text-gold">
              {selected} · {hhmm(selectedStart)}–{hhmm(selectedStart + duration * 60)} · {duration}h
            </p>
          )}

          {quoting && (
            <ul className="mt-6 space-y-2.5 border-t hairline pt-5">
              {[0, 1].map((i) => (
                <li key={i} className="flex justify-between gap-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
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

          {/* Tus datos (aparecen al elegir horario, junto al botón de pago) */}
          {selectedStart !== null && (
            <div className="rise mt-6 border-t hairline pt-5">
              <span className="label-sm mb-3 block text-bone-mute">Tus datos</span>
              <div className="space-y-2">
                <label htmlFor="bk-name" className="sr-only">
                  Nombre (opcional)
                </label>
                <input
                  id="bk-name"
                  type="text"
                  placeholder="Nombre (opcional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
                <label htmlFor="bk-email" className="sr-only">
                  Email (requerido)
                </label>
                <input
                  id="bk-email"
                  type="email"
                  required
                  placeholder="Email *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
                <label htmlFor="bk-phone" className="sr-only">
                  Teléfono (opcional)
                </label>
                <input
                  id="bk-phone"
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {error && <p className="mt-4 label-sm text-sirena">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canPay}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
          >
            {submitting ? "Redirigiendo…" : "Ir a pagar"}
            <span>→</span>
          </button>
          {selectedStart !== null && !email ? (
            <p className="mt-3 text-center label-sm text-gold">Ingresa tu email para continuar</p>
          ) : (
            <p className="mt-3 text-center label-sm text-bone-mute">IVA incluido · pago seguro con Mercado Pago</p>
          )}
        </div>
      </div>

      {/* Barra fija móvil */}
      {selectedStart !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t hairline bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <div className="label-sm text-bone-mute">Total</div>
            <div className="font-display text-xl text-bone">
              {quote ? formatCLP(quote.total) : quoting ? <Skeleton className="h-6 w-20" /> : "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!canPay}
            className="inline-flex items-center justify-center gap-2 bg-gold px-6 py-3 label text-ink disabled:opacity-40"
          >
            {submitting ? "…" : "Ir a pagar"}
            <span>→</span>
          </button>
        </div>
      )}
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
