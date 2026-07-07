"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { formatCLP } from "@/src/domain/money/money";
import { clampPoints } from "@/src/domain/points/points";
import { availableStartMinutes, type Interval } from "@/src/domain/scheduling/availability";
import type { DayStatus } from "@/src/domain/scheduling/month-availability";
import { MIN_LEAD_MINUTES } from "@/src/domain/scheduling/booking-rules";
import { accountEnabled } from "@/lib/flags";
import { BookingRequestError, bookingErrorMessage } from "@/lib/booking-error";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import Calendar from "./Calendar";
import TimeSlots from "./TimeSlots";
import Skeleton from "./Skeleton";
import { hhmm, tierLabel } from "./format";
import { useIsDesktop } from "./useIsDesktop";

// SDK de MP solo en el browser y solo cuando el brick monta (post-payReady).
const MpWalletButton = dynamic(() => import("./MpWalletButton"), { ssr: false });

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
  volumePct: number;
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

export default function BookingWidget({
  resourceId,
  addons = [],
  volumeDiscounts = [],
  customer = null,
}: {
  resourceId: string;
  addons?: { key: string; name: string; amount: number; kind: "flat_service" | "per_hour" }[];
  volumeDiscounts?: { minHours: number; pct: number }[];
  /** Sesión de cliente (server la resuelve): prefill + puntos canjeables. */
  customer?: { email: string; name: string; phone: string; points: number } | null;
}) {
  const router = useRouter();
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
  const [rec, setRec] = useState<string>("none");
  const [extras, setExtras] = useState<string[]>([]);
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [pointsInput, setPointsInput] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // Login en línea (código OTP): entrar sin salir del flujo de reserva.
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginStep, setLoginStep] = useState<"email" | "code">("email");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginVerified, setLoginVerified] = useState(false);
  const [syncedCustomer, setSyncedCustomer] = useState<string | null>(null);

  // Al llegar la sesión (tras verificar el código → router.refresh() re-resuelve
  // `customer` en el server sin desmontar el widget): prefill + cerrar el panel.
  // Patrón "ajustar estado al cambiar un prop" en render (no en efecto) — las
  // selecciones de reserva (fecha/hora/duración) sobreviven al refresh.
  if (customer && customer.email !== syncedCustomer) {
    setSyncedCustomer(customer.email);
    setEmail(customer.email);
    setName((n) => n || customer.name);
    setPhone((p) => p || customer.phone);
    setLoginOpen(false);
  }

  // Paso 1: pide el código de acceso al correo (sin emailRedirectTo → no navega).
  const sendLoginCode = useCallback(async () => {
    if (!loginEmail) return;
    setLoginBusy(true);
    setLoginError(null);
    const supabase = createAuthBrowserClient();
    // shouldCreateUser:true — entrar y crear cuenta son el mismo gesto.
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: { shouldCreateUser: true },
    });
    setLoginBusy(false);
    if (error) {
      setLoginError(
        error.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "No pudimos enviar el código. Revisa el correo e inténtalo de nuevo.",
      );
      return;
    }
    setLoginStep("code");
  }, [loginEmail]);

  // Paso 2: verifica el código → establece sesión en el browser → refresh server.
  const verifyLoginCode = useCallback(async () => {
    const token = loginCode.trim();
    if (!token) return;
    setLoginBusy(true);
    setLoginError(null);
    const supabase = createAuthBrowserClient();
    const { error } = await supabase.auth.verifyOtp({ email: loginEmail, token, type: "email" });
    if (error) {
      setLoginBusy(false);
      setLoginError("Código inválido o expirado. Pide uno nuevo.");
      return;
    }
    // Éxito: NO reseteamos loginBusy — el estado de carga puentea sin corte hasta
    // que llega `customer` (el server component re-resuelve prefill + puntos) y el
    // ajuste en render cierra el panel. El widget no se desmonta → estado intacto.
    setLoginVerified(true);
    router.refresh();
  }, [loginEmail, loginCode, router]);

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
  const minStart = selected === today ? nowMinuteInSantiago() + MIN_LEAD_MINUTES : 0;
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
      const keys = [...(rec !== "none" ? [rec] : []), ...extras];
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
  }, [resourceId, selected, selectedStart, duration, rec, extras]);

  // Canje: derivado y SIEMPRE re-acotado al render (si cambia el total, el
  // aplicado se ajusta solo). El servidor re-valida contra el saldo real.
  const maxApplicable = customer && quote ? clampPoints(customer.points, quote.total, customer.points) : 0;
  const pointsApplied = usePoints && customer && quote ? clampPoints(customer.points, quote.total, pointsInput) : 0;
  const payable = quote ? quote.total - pointsApplied : null;
  const fullPoints = pointsApplied > 0 && payable === 0;

  // Crea pedido + hold + preference (POST /api/bookings). Lanza BookingRequestError
  // con el código mapeable; deja `error` seteado y `submitting` reseteado al fallar.
  const createBookingAndGetPreference = useCallback(async (): Promise<{
    orderId: string;
    preferenceId?: string;
    initPoint?: string;
    paidWithPoints?: boolean;
  }> => {
    if (selected === null || selectedStart === null || !email) {
      throw new BookingRequestError("invalid");
    }
    setSubmitting(true);
    setError(null);
    try {
      let data: {
        error?: string;
        orderId?: string;
        preferenceId?: string;
        initPoint?: string;
        paidWithPoints?: boolean;
      };
      let ok: boolean;
      try {
        const res = await fetch("/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resourceId,
            date: selected,
            startMinute: selectedStart,
            durationHours: duration,
            addonKeys: [...(rec !== "none" ? [rec] : []), ...extras],
            customer: { name, email, phone },
            pointsToRedeem: pointsApplied,
          }),
        });
        ok = res.ok;
        data = await res.json();
      } catch {
        throw new BookingRequestError("network");
      }
      if (!ok) throw new BookingRequestError(data?.error);
      return data as { orderId: string; preferenceId?: string; initPoint?: string; paidWithPoints?: boolean };
    } catch (e) {
      const err = e instanceof BookingRequestError ? e : new BookingRequestError("network");
      setError(bookingErrorMessage(err.code));
      setSubmitting(false);
      throw err;
    }
  }, [resourceId, selected, selectedStart, duration, rec, extras, name, email, phone, pointsApplied]);

  // Flujo clásico (fallback): redirect a init_point. `submitting` queda en true
  // a propósito → "Redirigiendo…" mientras el navegador navega.
  const submit = useCallback(async () => {
    try {
      const { initPoint } = await createBookingAndGetPreference();
      window.location.assign(initPoint as string);
    } catch {
      // error ya seteado por createBookingAndGetPreference
    }
  }, [createBookingAndGetPreference]);

  // Flujo Wallet Brick: resuelve el preferenceId; el brick hace el redirect.
  const walletSubmit = useCallback(async () => {
    const { preferenceId } = await createBookingAndGetPreference();
    setSubmitting(false);
    return preferenceId as string;
  }, [createBookingAndGetPreference]);

  // Flujo 100% puntos: no hay paso de pago — la reserva ya sale confirmada;
  // directo a la página de estado. `submitting` queda en true durante la navegación.
  const pointsSubmit = useCallback(async () => {
    try {
      const { orderId } = await createBookingAndGetPreference();
      window.location.assign(`/reserva/estado?b=${orderId}`);
    } catch {
      // error ya seteado por createBookingAndGetPreference
    }
  }, [createBookingAndGetPreference]);

  const isDesktop = useIsDesktop();
  const [walletFailed, setWalletFailed] = useState(false);
  // Gate de montaje del brick: SIN !submitting (desmontaría el brick a mitad del pago).
  // Requiere aceptar T&C → ninguna vía de pago (clásica, Wallet, puntos) la evita.
  const payReady = selectedStart !== null && !!email && acceptedTerms;
  const walletEnabled = !!process.env.NEXT_PUBLIC_MP_PUBLIC_KEY && !walletFailed;
  const canPay = payReady && !submitting;
  const quoting = selectedStart !== null && !quote;
  const inputCls =
    "w-full border hairline bg-ink px-4 py-3 font-mono text-sm text-bone outline-none transition-colors hover:border-gold focus-visible:border-gold";
  const recordingAddons = addons.filter((a) => a.kind === "flat_service");
  const hourlyAddons = addons.filter((a) => a.kind === "per_hour");
  const hourlyKeys = new Set(hourlyAddons.map((a) => a.key));

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:pb-0">
      {/* IZQUIERDA: 1 duración · 2 fecha · 3 hora (grabación va en el resumen) */}
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
          {volumeDiscounts.length > 0 && (
            <p className="label-sm mt-3 text-bone-mute">
              Ahorra:{" "}
              {volumeDiscounts.map((v, i) => (
                <span key={v.minHours}>
                  {i > 0 && " · "}
                  <span className={duration >= v.minHours ? "text-gold" : ""}>
                    {v.minHours}h −{Math.round(v.pct * 100)}%
                  </span>
                </span>
              ))}
            </p>
          )}
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

      </div>

      {/* DERECHA: resumen → desglose → tus datos → pago */}
      <div className="grain relative overflow-hidden border hairline bg-ink lg:sticky lg:top-28">
        <div className="relative p-6 md:p-8">
          <span className="label text-bone-mute">{pointsApplied > 0 ? "Total a pagar" : "Total"}</span>
          {quote ? (
            <div className="mt-3 font-display text-bone" style={{ fontSize: "clamp(2.6rem,8vw,4rem)" }}>
              {formatCLP(payable ?? quote.total)}
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
                  <span>{tierLabel(l.key)} · {l.hours}h</span>
                  <span className="font-mono text-bone">{formatCLP(l.subtotal)}</span>
                </li>
              ))}
              {quote.addonLines.map((a) => (
                <li key={a.key} className="flex justify-between gap-3 text-bone-dim">
                  <span>
                    {a.name}
                    {hourlyKeys.has(a.key) ? ` · ${duration}h` : ""}
                  </span>
                  <span className="font-mono text-bone">{formatCLP(a.amount)}</span>
                </li>
              ))}
              {quote.discount > 0 && (
                <li className="flex justify-between gap-3 text-gold">
                  <span>Descuento{quote.volumePct > 0 ? ` (${Math.round(quote.volumePct * 100)}%)` : ""}</span>
                  <span className="font-mono">−{formatCLP(quote.discount)}</span>
                </li>
              )}
              {pointsApplied > 0 && (
                <li className="flex justify-between gap-3 text-gold">
                  <span>Puntos</span>
                  <span className="font-mono">−{formatCLP(pointsApplied)}</span>
                </li>
              )}
            </ul>
          )}

          {/* Mejora la sesión: grabación (elige una) + guía por hora (opcional). */}
          {recordingAddons.length > 0 && (
            <div className="mt-6 border-t hairline pt-5">
              <span className="label-sm text-bone-mute">¿Grabamos tu sesión?</span>
              <p className="font-editorial mt-1 text-sm text-bone-dim">Llévate tu set listo para publicar.</p>
              <div className="mt-3 space-y-1.5">
                <RecOption active={rec === "none"} onClick={() => setRec("none")} label="Sin grabación" />
                {recordingAddons.map((a) => (
                  <RecOption
                    key={a.key}
                    active={rec === a.key}
                    onClick={() => setRec(a.key)}
                    label={a.name}
                    delta={`+${formatCLP(a.amount)}`}
                  />
                ))}
              </div>
            </div>
          )}

          {hourlyAddons.length > 0 && (
            <div className="mt-6 border-t hairline pt-5">
              <span className="label-sm text-bone-mute">¿Sumas un guía?</span>
              <p className="font-editorial mt-1 text-sm text-bone-dim">Un DJ te acompaña durante toda la sesión.</p>
              <div className="mt-3 space-y-1.5">
                {hourlyAddons.map((a) => (
                  <RecOption
                    key={a.key}
                    active={extras.includes(a.key)}
                    onClick={() =>
                      setExtras((xs) => (xs.includes(a.key) ? xs.filter((k) => k !== a.key) : [...xs, a.key]))
                    }
                    label={a.name}
                    delta={`+${formatCLP(a.amount)}/h`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tus puntos (solo con sesión y saldo) */}
          {customer && customer.points > 0 && quote && selectedStart !== null && (
            <div className="mt-6 border-t hairline pt-5">
              <span className="label-sm text-bone-mute">Tus puntos</span>
              <p className="mt-1 text-sm text-bone-dim">
                Tienes <strong className="text-bone">{formatCLP(customer.points)}</strong> en puntos.
              </p>
              <div className="mt-3 space-y-1.5">
                <RecOption
                  active={usePoints}
                  onClick={() => {
                    setUsePoints((v) => {
                      if (!v) setPointsInput(maxApplicable);
                      return !v;
                    });
                  }}
                  label="Usar mis puntos"
                  delta={usePoints ? `−${formatCLP(pointsApplied)}` : undefined}
                />
              </div>
              {usePoints && (
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor="bk-points" className="sr-only">
                    Puntos a usar
                  </label>
                  <input
                    id="bk-points"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={maxApplicable}
                    value={pointsInput}
                    onChange={(e) => setPointsInput(Number(e.target.value) || 0)}
                    onBlur={() => setPointsInput(pointsApplied)}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setPointsInput(maxApplicable)}
                    className="label-sm shrink-0 border hairline px-3 py-3 text-bone-dim transition-colors hover:border-gold hover:text-gold"
                  >
                    Máx
                  </button>
                </div>
              )}
            </div>
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
                  disabled={!!customer}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputCls} ${customer ? "opacity-60" : ""}`}
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
              {customer ? (
                <>
                  {loginVerified && (
                    <p className="label-sm mt-2 text-gold">✓ ¡Sesión iniciada! Ya puedes usar tus puntos.</p>
                  )}
                  <p className="label-sm mt-2 text-bone-mute">Sesión iniciada como {customer.email}.</p>
                </>
              ) : (
                accountEnabled() &&
                (loginOpen ? (
                  <div className="mt-3 border hairline p-4">
                    {loginStep === "email" ? (
                      <>
                        <span className="label-sm block text-bone-mute">
                          Te enviamos un código de acceso a tu correo — sin salir de aquí.
                        </span>
                        <div className="mt-3 space-y-2">
                          <label htmlFor="bk-login-email" className="sr-only">
                            Correo
                          </label>
                          <input
                            id="bk-login-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="tu@correo.cl"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && void sendLoginCode()}
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() => void sendLoginCode()}
                            disabled={loginBusy || !loginEmail}
                            className="w-full bg-gold px-5 py-3 label text-ink transition-opacity disabled:opacity-40"
                          >
                            {loginBusy ? "Enviando…" : "Enviar código"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="label-sm block text-bone-mute">
                          Escribe el código que enviamos a{" "}
                          <strong className="text-bone">{loginEmail}</strong>.
                        </span>
                        <div className="mt-3 space-y-2">
                          <label htmlFor="bk-login-code" className="sr-only">
                            Código de acceso
                          </label>
                          <input
                            id="bk-login-code"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="Código de 6 dígitos"
                            value={loginCode}
                            onChange={(e) => setLoginCode(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && void verifyLoginCode()}
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() => void verifyLoginCode()}
                            disabled={loginBusy || !loginCode.trim()}
                            className="w-full bg-gold px-5 py-3 label text-ink transition-opacity disabled:opacity-40"
                          >
                            {loginVerified ? "Iniciando sesión…" : loginBusy ? "Verificando…" : "Verificar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void sendLoginCode()}
                            disabled={loginBusy}
                            className="label-sm text-bone-mute transition-colors hover:text-gold disabled:opacity-40"
                          >
                            Reenviar código
                          </button>
                        </div>
                      </>
                    )}
                    {loginError && <p className="mt-2 label-sm text-sirena">{loginError}</p>}
                  </div>
                ) : (
                  <p className="label-sm mt-2 text-bone-mute">
                    ¿Tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setLoginError(null);
                        setLoginStep("email");
                        setLoginEmail(email);
                        setLoginOpen(true);
                      }}
                      className="text-gold transition-opacity hover:opacity-80"
                    >
                      Inicia sesión
                    </button>{" "}
                    para usar tus puntos.
                  </p>
                ))
              )}

              {/* Aceptación de T&C — obligatoria para pagar (gatea payReady). */}
              <label className="mt-4 flex items-start gap-2.5 text-bone-dim">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
                />
                <span className="label-sm leading-relaxed">
                  Acepto los{" "}
                  <Link
                    href="/terminos"
                    target="_blank"
                    className="text-gold transition-opacity hover:opacity-80"
                  >
                    términos y condiciones
                  </Link>{" "}
                  y la{" "}
                  <Link
                    href="/privacidad"
                    target="_blank"
                    className="text-gold transition-opacity hover:opacity-80"
                  >
                    política de privacidad
                  </Link>
                  .
                </span>
              </label>
            </div>
          )}

          {error && <p className="mt-4 label-sm text-sirena">{error}</p>}

          {fullPoints ? (
            // Puntos cubren el 100%: sin paso de pago — el brick NO debe montar.
            <button
              type="button"
              onClick={pointsSubmit}
              disabled={!canPay}
              className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
            >
              {submitting ? "Confirmando…" : "Pagar con puntos"}
              <span>→</span>
            </button>
          ) : payReady && walletEnabled && isDesktop === true ? (
            <MpWalletButton
              className="mt-6"
              onSubmit={walletSubmit}
              onFallback={() => setWalletFailed(true)}
            />
          ) : payReady && walletEnabled && isDesktop === false ? null : (
            // En móvil con wallet activo el CTA único es el brick de la barra
            // fija (evita dos botones distintos a la vez); si no, botón clásico.
            <button
              type="button"
              onClick={submit}
              disabled={!canPay}
              className="mt-6 inline-flex w-full items-center justify-center gap-3 bg-gold px-7 py-4 label text-ink transition-transform disabled:opacity-40"
            >
              {submitting ? "Redirigiendo…" : "Ir a pagar"}
              <span>→</span>
            </button>
          )}
          {selectedStart !== null && !email ? (
            <p className="mt-3 text-center label-sm text-gold">Ingresa tu email para continuar</p>
          ) : selectedStart !== null && !acceptedTerms ? (
            <p className="mt-3 text-center label-sm text-gold">Acepta los términos para continuar</p>
          ) : fullPoints ? (
            <p className="mt-3 text-center label-sm text-bone-mute">Tu reserva queda confirmada al instante</p>
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
              {quote ? formatCLP(payable ?? quote.total) : quoting ? <Skeleton className="h-6 w-20" /> : "—"}
            </div>
          </div>
          {fullPoints ? (
            <button
              type="button"
              onClick={pointsSubmit}
              disabled={!canPay}
              className="inline-flex items-center justify-center gap-2 bg-gold px-6 py-3 label text-ink disabled:opacity-40"
            >
              {submitting ? "…" : "Pagar con puntos"}
              <span>→</span>
            </button>
          ) : payReady && walletEnabled && isDesktop === false ? (
            <div className="min-w-0 flex-1">
              <MpWalletButton onSubmit={walletSubmit} onFallback={() => setWalletFailed(true)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canPay}
              className="inline-flex items-center justify-center gap-2 bg-gold px-6 py-3 label text-ink disabled:opacity-40"
            >
              {submitting ? "…" : "Ir a pagar"}
              <span>→</span>
            </button>
          )}
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

function RecOption({
  active,
  onClick,
  label,
  delta,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  delta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-3 border px-4 py-3 text-left label-sm transition-colors ${
        active ? "border-gold bg-gold text-ink" : "hairline text-bone-dim hover:border-gold hover:text-gold"
      }`}
    >
      <span>{label}</span>
      {delta && <span className="font-mono">{delta}</span>}
    </button>
  );
}
