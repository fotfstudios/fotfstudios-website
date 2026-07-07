"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Card } from "@/components/admin/ui/Card";
import { Field, Input, Textarea } from "@/components/admin/ui/Field";
import { Skeleton } from "@/components/admin/ui/Skeleton";
import { btn } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { hhmm } from "@/components/booking/format";
import type { ManualPaymentMethod } from "@/lib/manual-booking";
import { manualBookingWhatsAppMessage, waLink } from "@/lib/whatsapp";
import { formatCLP } from "@/src/domain/money/money";
import { overlaps } from "@/src/domain/scheduling/availability";
import type { DayStatus } from "@/src/domain/scheduling/month-availability";
import { nowMinuteInTz } from "@/src/domain/scheduling/time";
import { createManualBookingAction, getDayConsoleAction } from "../actions";
import type { DayConsoleData, ManualBookingResult } from "../types";
import { AddonPicker, type CatalogAddon } from "./AddonPicker";
import { AdminCalendar } from "./AdminCalendar";
import { CobroCard, type QuoteView } from "./CobroCard";
import { DayStrip } from "./DayStrip";
import { DurationStepper } from "./DurationStepper";
import { SlotGrid, type SlotView } from "./SlotGrid";
import { SuccessPanel } from "./SuccessPanel";

/** Ventana "fuera de horario" ofrecida solo a cortesía: 08:00–24:00. */
const OOH_START = 8 * 60;
const OOH_END = 24 * 60;

const METHOD_LABEL: Record<ManualPaymentMethod, string> = {
  pendiente: "Pendiente",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cortesia: "Cortesía",
};

interface SuccessState {
  result: ManualBookingResult;
  /** Lo enviado, congelado: el refresh del día invalida la selección derivada. */
  snapshot: {
    date: string;
    startMinute: number;
    durationHours: number;
    method: ManualPaymentMethod;
    name?: string;
    phone?: string;
    addonNames: string[];
  };
}

export default function BookingConsole({
  resourceId,
  tz,
  today,
  maxDate,
  initialDate,
  initialStartMinute,
  initialMonth,
  initialMonthStatus,
  initialDay,
  addons,
  volumeDiscounts,
}: {
  resourceId: string;
  tz: string;
  today: string;
  maxDate: string;
  /** Prefill desde la agenda (?d=&h=), ya validado por la página. */
  initialDate: string;
  initialStartMinute: number | null;
  initialMonth: string;
  initialMonthStatus: Record<string, DayStatus>;
  initialDay: DayConsoleData;
  addons: CatalogAddon[];
  volumeDiscounts: { minHours: number; pct: number }[];
}) {
  const toast = useToast();

  const [month, setMonth] = useState(initialMonth);
  const [dayStatus, setDayStatus] = useState<Record<string, DayStatus>>(initialMonthStatus);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [date, setDate] = useState(initialDate);
  const [dayData, setDayData] = useState<DayConsoleData | null>(initialDay);
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState(false);

  const [start, setStart] = useState<number | null>(initialStartMinute);
  const [duration, setDuration] = useState(1);
  const [rec, setRec] = useState("none");
  const [extras, setExtras] = useState<string[]>([]);
  const [method, setMethod] = useState<ManualPaymentMethod>("pendiente");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAttested, setTermsAttested] = useState(false);

  /** Última cotización recibida, con la clave de sus parámetros: si la clave ya
   *  no calza con la selección actual, simplemente no se muestra (sin limpiar). */
  const [quoteRes, setQuoteRes] = useState<{ key: string; quote: QuoteView | null; error: boolean } | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [pending, startTransition] = useTransition();

  // Disponibilidad del mes visible (el inicial viene precargado del server).
  // Dirigido por evento (no effect): gana la última respuesta.
  const monthReq = useRef(0);
  const changeMonth = (m: string) => {
    setMonth(m);
    const id = ++monthReq.current;
    setLoadingMonth(true);
    void (async () => {
      try {
        const d = await (await fetch(`/api/availability/month?resource=${resourceId}&month=${m}`)).json();
        if (monthReq.current === id) setDayStatus((d?.days ?? {}) as Record<string, DayStatus>);
      } catch {
        if (monthReq.current === id) setDayStatus({});
      } finally {
        if (monthReq.current === id) setLoadingMonth(false);
      }
    })();
  };

  // Día seleccionado: server action (la ocupación con nombres es solo-admin).
  // Contador monotónico → gana la última respuesta.
  const dayReq = useRef(0);
  const loadDay = useCallback((d: string) => {
    const id = ++dayReq.current;
    setLoadingDay(true);
    setDayError(false);
    void getDayConsoleAction(d)
      .then((res) => {
        if (dayReq.current !== id) return;
        if (res.ok) setDayData(res.data);
        else {
          setDayData(null);
          setDayError(true);
        }
      })
      .catch(() => {
        if (dayReq.current === id) {
          setDayData(null);
          setDayError(true);
        }
      })
      .finally(() => {
        if (dayReq.current === id) setLoadingDay(false);
      });
  }, []);

  const selectDate = (d: string) => {
    if (d === date) return;
    setDate(d);
    setStart(null);
    loadDay(d);
  };

  // ── derivados (la invalidación es gratis: nada de estado duplicado)
  const nowMin = nowMinuteInTz(tz);
  const avail = dayData?.avail ?? null;
  const occupancy = dayData?.occupancy ?? [];
  const isCortesia = method === "cortesia";
  const open = avail && !avail.closed ? avail.openMinute : 0;
  const close = avail && !avail.closed ? avail.closeMinute : 0;

  const buildSlot = (m: number, outOfHours: boolean, windowEnd: number): SlotView => {
    const hour = { start: m, end: m + 60 };
    const full = { start: m, end: m + duration * 60 };
    const hourHits = occupancy.filter((o) => overlaps(hour, o));
    if (hourHits.length > 0) {
      const isBlock = hourHits.some((o) => o.kind === "block");
      return { minute: m, tag: isBlock ? "bloqueo" : "ocupado", disabled: true, warn: false };
    }
    if (full.end > windowEnd || occupancy.some((o) => overlaps(full, o))) {
      return { minute: m, tag: "no alcanza", disabled: true, warn: false };
    }
    const isPast = date < today || (date === today && m <= nowMin);
    if (isPast) return { minute: m, tag: "pasado", disabled: !isCortesia, warn: isCortesia };
    return { minute: m, tag: null, disabled: false, warn: outOfHours && isCortesia };
  };

  const mainSlots: SlotView[] = [];
  for (let m = open; m + 60 <= close; m += 60) mainSlots.push(buildSlot(m, false, close));

  const oohSlots: SlotView[] = [];
  if (isCortesia && avail) {
    for (let m = OOH_START; m + 60 <= OOH_END; m += 60) {
      if (m >= open && m < close) continue; // ya listado en el horario normal
      oohSlots.push(buildSlot(m, true, OOH_END));
    }
  }

  const selectedSlot =
    start !== null
      ? ([...mainSlots, ...oohSlots].find((s) => s.minute === start && !s.disabled) ?? null)
      : null;
  const selectedStart = selectedSlot?.minute ?? null;
  const selectedOoh = selectedStart !== null && (selectedStart < open || selectedStart >= close);

  const maxDuration = Math.min(
    16,
    selectedStart !== null
      ? ((selectedOoh ? OOH_END : close) - selectedStart) / 60
      : close > open
        ? (close - open) / 60
        : 8,
  );

  const warning =
    isCortesia && selectedSlot
      ? selectedSlot.tag === "pasado"
        ? "Horario en el pasado. Se registrará igual como cortesía."
        : selectedSlot.warn
          ? "Fuera del horario de apertura. Se registrará igual como cortesía."
          : null
      : null;

  // Cotización en vivo (también para cortesía: valor de referencia). Debounce + abort.
  const quoteKey =
    selectedStart !== null ? `${date}|${selectedStart}|${duration}|${rec}|${extras.join(",")}` : null;
  useEffect(() => {
    if (quoteKey === null || selectedStart === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const keys = [...(rec !== "none" ? [rec] : []), ...extras];
      const qs = new URLSearchParams({
        resource: resourceId,
        date,
        start: String(selectedStart),
        duration: String(duration),
        addons: keys.join(","),
      });
      void (async () => {
        try {
          const r = await fetch(`/api/pricing/quote?${qs}`, { signal: ctrl.signal });
          const d = await r.json();
          if (!r.ok || d?.error) setQuoteRes({ key: quoteKey, quote: null, error: true });
          else setQuoteRes({ key: quoteKey, quote: d as QuoteView, error: false });
        } catch {
          if (!ctrl.signal.aborted) setQuoteRes({ key: quoteKey, quote: null, error: true });
        }
      })();
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [quoteKey, resourceId, date, selectedStart, duration, rec, extras]);

  const quote = quoteKey !== null && quoteRes?.key === quoteKey ? quoteRes.quote : null;
  const quoteError = quoteKey !== null && quoteRes?.key === quoteKey ? quoteRes.error : false;
  const quoting = quoteKey !== null && quoteRes?.key !== quoteKey;

  const canSubmit =
    selectedStart !== null && !pending && !loadingDay && (isCortesia ? true : quote !== null);

  const submit = () => {
    if (selectedStart === null) return;
    setSubmitError(null);
    const addonKeys = [...(rec !== "none" ? [rec] : []), ...extras];
    const input = {
      date,
      startMinute: selectedStart,
      durationHours: duration,
      addonKeys,
      method,
      customer: { name: name.trim() || undefined, email: email.trim() || undefined, phone: phone.trim() || undefined },
      notes,
      termsAccepted: termsAttested,
    };
    startTransition(async () => {
      const res = await createManualBookingAction(input);
      if (res.ok) {
        toast({ tone: "ok", message: "Reserva creada." });
        setSuccess({
          result: res.data,
          snapshot: {
            date,
            startMinute: selectedStart,
            durationHours: duration,
            method,
            name: name.trim() || undefined,
            phone: phone.trim() || undefined,
            addonNames: addons.filter((a) => addonKeys.includes(a.key)).map((a) => a.name),
          },
        });
        loadDay(date); // la reserva recién creada aparece en la cinta al volver
      } else {
        setSubmitError(res.error);
        toast({ tone: "error", message: res.error });
      }
    });
  };

  const resetForAnother = () => {
    setSuccess(null);
    setStart(null);
    setRec("none");
    setExtras([]);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setTermsAttested(false);
    setSubmitError(null);
  };

  const dayLabel = DateTime.fromISO(date).setLocale("es").toFormat("ccc d LLL");
  const selectionLabel =
    selectedStart !== null
      ? `${dayLabel} · ${hhmm(selectedStart)}–${hhmm(selectedStart + duration * 60)} · ${duration}h`
      : null;
  const hourlyKeys = new Set(addons.filter((a) => a.kind === "per_hour").map((a) => a.key));

  // ── éxito: panel de confirmación en lugar de la consola
  if (success) {
    const { result, snapshot } = success;
    const message = manualBookingWhatsAppMessage({
      name: snapshot.name,
      date: snapshot.date,
      startMinute: snapshot.startMinute,
      durationHours: snapshot.durationHours,
      total: result.amount,
      method: snapshot.method,
      addonNames: snapshot.addonNames,
    });
    const waHref = snapshot.phone ? waLink(snapshot.phone, message) : null;
    const isPendiente = snapshot.method === "pendiente";
    return (
      <SuccessPanel
        heading={isPendiente ? "Reserva creada, pendiente de pago" : "Reserva creada"}
        rows={[
          {
            label: "Día y hora",
            value: `${DateTime.fromISO(snapshot.date).setLocale("es").toFormat("ccc d LLL")} · ${hhmm(snapshot.startMinute)}–${hhmm(snapshot.startMinute + snapshot.durationHours * 60)}`,
          },
          { label: "Duración", value: `${snapshot.durationHours}h` },
          { label: "Cliente", value: snapshot.name ?? "Sin nombre" },
          { label: "Método", value: METHOD_LABEL[snapshot.method] },
          { label: result.amount !== null ? "Total" : "Valor", value: result.amount !== null ? formatCLP(result.amount) : "Sin cobro" },
        ]}
        waHref={waHref}
        reservationId={result.reservationId}
        noPhone={!waHref}
        onReset={resetForAnother}
      />
    );
  }

  const retryDay = (
    <div className="flex flex-col items-start gap-3">
      <p className="label-sm text-sirena">No se pudo cargar la disponibilidad.</p>
      <button type="button" onClick={() => loadDay(date)} className={btn("secondary", "sm")}>
        Reintentar
      </button>
    </div>
  );

  return (
    <div className="mt-8 grid gap-6 pb-24 lg:grid-cols-[1fr_22rem] lg:items-start lg:pb-0">
      {/* IZQUIERDA: día y hora → cinta del día → extras → cliente */}
      <div className="flex flex-col gap-6">
        <Card title="Día y hora">
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <AdminCalendar
              month={month}
              today={today}
              maxDate={maxDate}
              selected={date}
              dayStatus={dayStatus}
              loading={loadingMonth}
              onSelect={selectDate}
              onMonth={changeMonth}
            />
            <div className="flex flex-col gap-5">
              <div>
                <span className="label-sm text-bone-mute">Duración</span>
                <div className="mt-2">
                  <DurationStepper
                    duration={duration}
                    maxDuration={maxDuration}
                    volumeDiscounts={volumeDiscounts}
                    onChange={setDuration}
                  />
                </div>
              </div>
              <div>
                <span className="label-sm text-bone-mute">Horarios</span>
                <div className="mt-2">
                  {loadingDay ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : dayError ? (
                    retryDay
                  ) : avail?.closed && !isCortesia ? (
                    <p className="label-sm py-6 text-bone-mute">
                      Cerrado ese día. Solo una cortesía puede registrarse fuera de horario.
                    </p>
                  ) : (
                    <SlotGrid slots={mainSlots} outOfHours={oohSlots} selected={selectedStart} onSelect={setStart} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title={`Día en cabina — ${dayLabel}`}>
          {loadingDay ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : dayError ? (
            retryDay
          ) : (
            <>
              {avail?.closed && <p className="label-sm mb-3 text-bone-mute">Cerrado ese día.</p>}
              <DayStrip
                open={open}
                close={close}
                occupancy={occupancy}
                selection={
                  selectedStart !== null ? { start: selectedStart, end: selectedStart + duration * 60 } : null
                }
              />
            </>
          )}
        </Card>

        {addons.length > 0 && (
          <Card title="Extras">
            <AddonPicker
              addons={addons}
              rec={rec}
              extras={extras}
              onRec={setRec}
              onToggleExtra={(key) =>
                setExtras((xs) => (xs.includes(key) ? xs.filter((k) => k !== key) : [...xs, key]))
              }
            />
          </Card>
        )}

        <Card title="Cliente">
          <div className="flex flex-col gap-4">
            <Field label="Nombre">
              <Input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Email" hint="Opcional">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Teléfono" hint="Para WhatsApp: +56 9 …">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Notas internas" hint="Solo para el panel. No se envían al cliente.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </Field>
            {/* Atestación de consentimiento (staff): confirma que el cliente aceptó los T&C.
                No bloquea el agendado; registra terms_source='staff' en el pedido pagado. */}
            <label className="flex items-start gap-2.5 text-bone-dim">
              <input
                type="checkbox"
                checked={termsAttested}
                onChange={(e) => setTermsAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
              />
              <span className="label-sm leading-relaxed">
                El cliente aceptó los{" "}
                <a href="/terminos" target="_blank" rel="noreferrer" className="text-gold hover:opacity-80">
                  términos y condiciones
                </a>{" "}
                y la{" "}
                <a href="/privacidad" target="_blank" rel="noreferrer" className="text-gold hover:opacity-80">
                  política de privacidad
                </a>
                .
              </span>
            </label>
          </div>
        </Card>
      </div>

      {/* DERECHA: la caja */}
      <CobroCard
        isCortesia={isCortesia}
        quote={quote}
        quoting={quoting}
        quoteError={quoteError}
        hasSelection={selectedStart !== null}
        selectionLabel={selectionLabel}
        duration={duration}
        hourlyKeys={hourlyKeys}
        method={method}
        onMethod={setMethod}
        warning={warning}
        error={submitError}
        pending={pending}
        canSubmit={canSubmit}
        onSubmit={submit}
      />

      {/* Barra fija móvil: aparece con horario elegido */}
      {selectedStart !== null && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t hairline bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <div className="label-sm text-bone-mute">{isCortesia ? "Valor cortesía" : "Total"}</div>
            <div className="font-display text-xl text-bone">
              {quote ? formatCLP(quote.total) : quoting ? <Skeleton className="h-6 w-20" /> : "—"}
            </div>
          </div>
          <button type="button" onClick={submit} disabled={!canSubmit} className={btn("primary")}>
            {pending ? "…" : isCortesia ? "Registrar cortesía" : method === "pendiente" ? "Crear pendiente" : "Crear reserva"}
          </button>
        </div>
      )}
    </div>
  );
}
