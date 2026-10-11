"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ds/Button";
import { useOtpLogin } from "@/components/cuenta/useOtpLogin";
import { BookingRequestError, bookingErrorMessage } from "@/lib/booking-error";
import { ctaLabel, missingItem, type BookingStep } from "@/lib/booking-steps";
import { summaryLines } from "@/lib/booking-summary";
import { accountEnabled } from "@/lib/flags";
import { clMobileDigits, formatClMobile, isValidClMobile } from "@/lib/phone-input";
import { normalizeEmail } from "@/src/domain/contact/contact";
import { formatCLP } from "@/src/domain/money/money";
import { clampPoints, computeEarn } from "@/src/domain/points/points";
import { FIRST_BOOKING_PROMO } from "@/src/domain/pricing/first-booking-promo";
import type { RateTier } from "@/src/domain/pricing/types";
import { dateShortLabel, monthRangeLabel, validStarts } from "@/src/domain/scheduling/day-starts";
import { createAuthBrowserClient } from "@/src/infrastructure/auth/browser";
import { hhmm } from "./format";
import { useIsDesktop } from "./useIsDesktop";
import BeatcoinsBlock from "./reservar/BeatcoinsBlock";
import BottomBar from "./reservar/BottomBar";
import CustomerSection, { type BookingCustomer } from "./reservar/CustomerSection";
import DayStrip from "./reservar/DayStrip";
import DurationSection from "./reservar/DurationSection";
import ExtrasDisclosure, { type Addon } from "./reservar/ExtrasDisclosure";
import PayCta from "./reservar/PayCta";
import PaySection from "./reservar/PaySection";
import PromoNote from "./reservar/PromoNote";
import ReviewCard from "./reservar/ReviewCard";
import SectionHead from "./reservar/SectionHead";
import StepBar from "./reservar/StepBar";
import SummaryCard from "./reservar/SummaryCard";
import TimeGrid from "./reservar/TimeGrid";
import { useAvailabilityRange } from "./reservar/useAvailabilityRange";
import { useLoginHint } from "./reservar/useLoginHint";
import { useBookingQuote } from "./reservar/useBookingQuote";
import Skeleton from "./Skeleton";

/** Corte del wizard móvil: debajo de esto, un paso a la vez con barra fija. */
const DESKTOP_QUERY = "(min-width: 860px)";
const STEP_INDEX: Record<BookingStep, number> = { horario: 0, datos: 1, pago: 2 };

/**
 * Checkout público de la sala (/reservar): duración → día y hora (+ extras) → datos → pago.
 * Orquestador: estado, derivados y envío; cada sección es presentacional (`reservar/*`).
 * En escritorio todo en una columna con el resumen fijo a la derecha; en móvil, wizard
 * de tres pasos con barra fija abajo. El total mostrado es el que se cobra (cotización
 * del servidor + promo con la misma función pura + Beatcoins acotados).
 */
export default function BookingWidget({
  resourceId,
  today,
  tiers = [],
  addons = [],
  volumeDiscounts = [],
  customer = null,
}: {
  resourceId: string;
  /** Hoy en la zona del recurso (lo resuelve el servidor: sin desfase de hidratación). */
  today: string;
  tiers?: RateTier[];
  addons?: Addon[];
  volumeDiscounts?: { minHours: number; pct: number }[];
  /** Sesión de cliente (server la resuelve): prefill + Beatcoins canjeables. */
  customer?: BookingCustomer | null;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop(DESKTOP_QUERY);
  const wizard = isDesktop === false;

  const range = useAvailabilityRange(resourceId, today);
  const [selected, setSelected] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [rec, setRec] = useState("none");
  const [extras, setExtras] = useState<string[]>([]);
  const [extrasOpen, setExtrasOpen] = useState(false);

  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(clMobileDigits(customer?.phone ?? ""));
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  // Avisos por WhatsApp: marcado por defecto (decisión del dueño), salvo que el titular ya se
  // haya dado de baja en /cuenta. Solo viaja con un celular válido.
  const [whatsappOptIn, setWhatsappOptIn] = useState(customer?.whatsappOptIn ?? true);
  const [usePoints, setUsePoints] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [tried, setTried] = useState(false);
  const [step, setStep] = useState(0);
  // A dónde llevar el foco tras el próximo render (ver efecto abajo).
  const pendingAnchor = useRef<string | null>(null);
  // Fuerza el render (y el efecto) aunque nada más cambie: segundo clic en el CTA.
  const [, setFocusTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletFailed, setWalletFailed] = useState(false);

  // Acceso con código sin salir del flujo. El correo es el mismo campo de la reserva.
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const login = useOtpLogin();
  const [syncedCustomer, setSyncedCustomer] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  // Correo de la sesión que se acaba de cerrar: no se le vuelve a ofrecer entrar.
  const [signedOutEmail, setSignedOutEmail] = useState<string | null>(null);
  const accountOn = accountEnabled();

  // Al llegar la sesión (verificar el código → router.refresh() re-resuelve `customer` sin
  // desmontar el widget): prefill + cerrar el panel. Ajuste en render, no en efecto: la
  // selección (día/hora/duración) sobrevive al refresh.
  if (customer && customer.email !== syncedCustomer) {
    setSyncedCustomer(customer.email);
    setEmail(customer.email);
    // Lo de la cuenta llena nombre y celular (siguen editables); lo tecleado se queda solo
    // donde la ficha no tiene dato.
    setName((n) => customer.name || n);
    setPhone((p) => clMobileDigits(customer.phone) || p);
    setLoginOpen(false);
  }
  // Al salir (refresh sin sesión): vuelve a invitado. El correo y los datos escritos se
  // quedan (puede seguir como invitado); los Beatcoins ya no aplican.
  if (!customer && syncedCustomer !== null) {
    setSignedOutEmail(normalizeEmail(syncedCustomer));
    setSyncedCustomer(null);
    setUsePoints(false);
    setSigningOut(false);
  }

  const signOut = async () => {
    setSigningOut(true);
    try {
      await createAuthBrowserClient().auth.signOut();
    } finally {
      router.refresh();
    }
  };

  // Invitado que escribe un correo con Beatcoins → se le ofrece entrar con código.
  const suggestLogin =
    useLoginHint(email, accountOn && !customer) && normalizeEmail(email) !== signedOutEmail;

  const sendLoginCode = useCallback(() => void login.send(email), [login, email]);
  // En éxito el hook deja busy en true a propósito: la carga puentea hasta que llega `customer`.
  const verifyLoginCode = useCallback(async () => {
    if (await login.verify(loginCode)) router.refresh();
  }, [login, loginCode, router]);

  // Día elegido por defecto: el primero con algún inicio para la duración (si no, el primero).
  const days = range.days;
  if (selected === null && days.length > 0) {
    setSelected((days.find((d) => validStarts(d, duration).length > 0) ?? days[0]).date);
  }
  const day = days.find((d) => d.date === selected) ?? null;
  const starts = day ? validStarts(day, duration) : [];
  const selectedStart = start !== null && starts.includes(start) ? start : null;

  const addonKeys = useMemo(() => [...(rec !== "none" ? [rec] : []), ...extras], [rec, extras]);
  const { quote, quoting, promoEmail, promoEligible, promoLine, total, requote } = useBookingQuote({
    resourceId,
    date: selected,
    start: selectedStart,
    duration,
    addonKeys,
    email,
  });

  // Beatcoins: el máximo aplicable, re-acotado en cada render contra el total YA con promo
  // (mismo orden descuento → Beatcoins que el servidor, que re-valida contra el saldo).
  const maxApplicable = customer && total !== null ? clampPoints(customer.points, total, customer.points) : 0;
  const pointsApplied = usePoints ? maxApplicable : 0;
  const payable = total !== null ? total - pointsApplied : null;
  const fullPoints = pointsApplied > 0 && payable === 0;
  // Lo que suma esta reserva: 5 % de lo que se paga en dinero (lo pagado con Beatcoins no suma).
  const earnPreview = payable !== null && selectedStart !== null ? computeEarn(payable) : null;

  const phoneValid = isValidClMobile(phone);
  const stepState = { hasSlot: selectedStart !== null, name, email, phone, termsAccepted: acceptedTerms };
  const missing = missingItem(stepState);
  const ready = missing === null && quote !== null;

  // Errores de campo: tras un intento, o al salir de un campo mal escrito.
  const emailBad = normalizeEmail(email) === null;
  const emailError =
    emailBad && (tried || (emailBlurred && email.trim()))
      ? email.trim()
        ? "Falta el @ o el dominio"
        : "Ingresa tu email"
      : undefined;
  const nameError = tried && !name.trim() ? "Escribe tu nombre" : undefined;
  const phoneError =
    !phoneValid && (tried || (phoneBlurred && phone))
      ? phone
        ? "Faltan dígitos: 9 1234 5678"
        : "Ingresa tu celular: 9 1234 5678"
      : undefined;
  const emailHint = customer
    ? "Sesión iniciada con este correo."
    : promoLine
      ? `−${FIRST_BOOKING_PROMO.pct}% de primera reserva aplicado.`
      : "Aquí llega la confirmación y el código de acceso.";

  // Llevar al usuario a lo que falta: en móvil primero se cambia de paso y, tras pintar,
  // se hace scroll + foco (el elemento del paso nuevo aún no existe en este render).
  useEffect(() => {
    const id = pendingAnchor.current;
    if (!id) return;
    pendingAnchor.current = null;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  });

  const goToMissing = () => {
    setTried(true);
    if (!missing) return;
    if (wizard) setStep(STEP_INDEX[missing.step]);
    pendingAnchor.current = missing.anchorId;
    setFocusTick((t) => t + 1);
  };

  const goStep = (n: number) => {
    setStep(n);
    setTried(false);
    window.scrollTo({ top: 0 });
  };

  const pickDuration = (h: number) => {
    setDuration(h);
    if (day && start !== null && !validStarts(day, h).includes(start)) setStart(null);
  };
  const pickDay = (date: string) => {
    setSelected(date);
    const d = days.find((x) => x.date === date);
    if (d && start !== null && !validStarts(d, duration).includes(start)) setStart(null);
  };

  // Crea pedido + hold + preference (POST /api/bookings). Lanza BookingRequestError con el
  // código mapeable; deja `error` seteado y `submitting` reseteado al fallar.
  const createBookingAndGetPreference = useCallback(async (): Promise<{
    orderId: string;
    preferenceId?: string;
    initPoint?: string;
    paidWithPoints?: boolean;
  }> => {
    if (selected === null || selectedStart === null || !email) throw new BookingRequestError("invalid");
    setSubmitting(true);
    setError(null);
    try {
      let data: { error?: string; orderId?: string; preferenceId?: string; initPoint?: string; paidWithPoints?: boolean };
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
            addonKeys,
            customer: { name, email, phone },
            pointsToRedeem: pointsApplied,
            termsAccepted: acceptedTerms,
            ...(phoneValid ? { whatsappOptIn } : {}),
            // Lo que ves es lo que pagas: el servidor rechaza (409) si su total difiere.
            expectedAmount: payable,
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
      // El total real ya no es el mostrado: re-cotiza antes del reintento.
      if (err.code === "amount_changed") requote();
      // Alguien tomó el horario: se refresca la tira y se suelta el inicio.
      if (err.code === "slot_taken") {
        setStart(null);
        void range.reload();
        if (wizard) setStep(0);
      }
      setError(bookingErrorMessage(err.code));
      setSubmitting(false);
      throw err;
    }
  }, [
    resourceId,
    selected,
    selectedStart,
    duration,
    addonKeys,
    name,
    email,
    phone,
    pointsApplied,
    acceptedTerms,
    phoneValid,
    whatsappOptIn,
    payable,
    requote,
    range,
    wizard,
  ]);

  // Redirect clásico a init_point. `submitting` queda en true a propósito ("Redirigiendo…").
  const submitClassic = useCallback(async () => {
    try {
      const { initPoint } = await createBookingAndGetPreference();
      window.location.assign(initPoint as string);
    } catch {
      // error ya seteado
    }
  }, [createBookingAndGetPreference]);

  // Wallet Brick: resuelve el preferenceId; el brick hace el redirect.
  const submitWallet = useCallback(async () => {
    const { preferenceId } = await createBookingAndGetPreference();
    setSubmitting(false);
    return preferenceId as string;
  }, [createBookingAndGetPreference]);

  // 100 % Beatcoins: la reserva ya sale confirmada; directo a la confirmación.
  const submitPoints = useCallback(async () => {
    try {
      const { orderId } = await createBookingAndGetPreference();
      window.location.assign(`/reserva/estado?b=${orderId}`);
    } catch {
      // error ya seteado
    }
  }, [createBookingAndGetPreference]);

  const walletEnabled = !!process.env.NEXT_PUBLIC_MP_PUBLIC_KEY && !walletFailed;
  const cta = (
    <PayCta
      label={ctaLabel({ state: stepState, tried, submitting, fullPoints, payable })}
      ready={ready}
      fullPoints={fullPoints}
      submitting={submitting}
      walletEnabled={walletEnabled}
      glow={ready}
      onBlocked={goToMissing}
      onClassic={submitClassic}
      onPoints={submitPoints}
      onWallet={submitWallet}
      onWalletFallback={() => setWalletFailed(true)}
    />
  );

  const hourlyKeys = new Set(addons.filter((a) => a.kind === "per_hour").map((a) => a.key));
  const lines = summaryLines({ quote, duration, hourlyKeys, promoLine, pointsApplied });
  const dateLabel = selected && selectedStart !== null ? dateShortLabel(selected) : null;
  const rangeLabel =
    selectedStart !== null ? `${hhmm(selectedStart)} – ${hhmm(selectedStart + duration * 60)} · ${duration}h` : null;
  const totalLabel = payable !== null && selectedStart !== null ? formatCLP(payable) : "—";
  const volPct = quote?.adjust
    ? volumeDiscounts.filter((v) => duration >= v.minHours).reduce((m, v) => Math.max(m, v.pct), 0)
    : 0;
  const under = fullPoints ? "Tu reserva queda confirmada al instante" : "IVA incluido · pago seguro con Mercado Pago";
  const promoNote = <PromoNote promoEmail={promoEmail} promoEligible={promoEligible} />;
  const extrasNames = addons.filter((a) => a.key === rec || extras.includes(a.key)).map((a) => a.name);

  const showTime = !wizard || step === 0;
  const showData = !wizard || step === 1;
  const showPay = !wizard || step === 2;
  const n = (desktopN: string) => (wizard ? undefined : desktopN);

  return (
    <div className="grid items-start gap-10 pb-40 min-[860px]:grid-cols-[minmax(0,1.5fr)_360px] min-[860px]:pb-0">
      <div className="flex min-w-0 flex-col gap-11">
        {wizard && <StepBar current={step} onGo={goStep} />}

        {showTime && (
          <>
            <DurationSection n={n("01")} duration={duration} onPick={pickDuration} day={day} volumeDiscounts={volumeDiscounts} />

            <section id="bk-schedule" tabIndex={-1} className="flex flex-col gap-6 outline-none" aria-labelledby="bk-schedule-title">
              <SectionHead
                id="bk-schedule-title"
                n={n("02")}
                title="Día y hora"
                aside={
                  days.length > 0 && (
                    <span className="ds-mono text-xs text-[var(--text-muted)]">
                      {monthRangeLabel(days[0].date, days[days.length - 1].date)}
                    </span>
                  )
                }
              >
                Elige el día y la hora de inicio. Solo se muestran bloques de {duration}h que caben completos.
              </SectionHead>

              {range.failed ? (
                <p role="alert" className="text-sm text-[var(--danger)]">
                  No pudimos cargar la disponibilidad. Recarga la página para intentar de nuevo.
                </p>
              ) : days.length === 0 ? (
                <div className="flex gap-1.5" role="status" aria-label="Cargando días">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[76px] w-16 shrink-0" />
                  ))}
                </div>
              ) : (
                <DayStrip
                  days={days}
                  duration={duration}
                  today={today}
                  selected={selected}
                  onSelect={pickDay}
                  canExtend={range.canExtend}
                  onExtend={() => void range.extend()}
                  loading={range.loading}
                />
              )}

              {day && (
                <TimeGrid
                  day={day}
                  tiers={tiers}
                  starts={starts}
                  duration={duration}
                  selectedStart={selectedStart}
                  onSelect={(m) => {
                    setStart(m);
                    setTried(false);
                  }}
                />
              )}
              {tried && selectedStart === null && (
                <p className="text-[13px] text-[var(--danger)]">Selecciona un horario para continuar.</p>
              )}

              <ExtrasDisclosure
                addons={addons}
                rec={rec}
                onRec={setRec}
                extras={extras}
                onToggleExtra={(k) => setExtras((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]))}
                duration={duration}
                open={extrasOpen}
                onToggle={() => setExtrasOpen((o) => !o)}
              />
            </section>
          </>
        )}

        {showData && (
          <CustomerSection
            n={n("03")}
            customer={customer}
            accountOn={accountOn}
            email={email}
            onEmail={(v) => {
              setEmail(v);
              setEmailBlurred(false);
            }}
            onEmailBlur={() => setEmailBlurred(true)}
            emailError={emailError}
            emailHint={emailHint}
            name={name}
            onName={setName}
            nameError={nameError}
            phoneDigits={phone}
            onPhoneDigits={setPhone}
            onPhoneBlur={() => setPhoneBlurred(true)}
            phoneError={phoneError}
            phoneValid={phoneValid}
            whatsappOptIn={whatsappOptIn}
            onWhatsappOptIn={setWhatsappOptIn}
            login={login}
            loginOpen={loginOpen}
            onLoginOpen={setLoginOpen}
            loginCode={loginCode}
            onLoginCode={setLoginCode}
            onSendCode={sendLoginCode}
            onVerifyCode={() => void verifyLoginCode()}
            suggestLogin={suggestLogin}
            onSignOut={() => void signOut()}
            signingOut={signingOut}
            earnPreview={earnPreview}
          />
        )}

        {wizard && step === 2 && (
          <ReviewCard
            session={dateLabel && rangeLabel ? `${dateLabel} · ${rangeLabel}` : "Sin horario"}
            extras={extrasNames.join(" · ") || "Sin extras"}
            contact={[email, name, phone ? `+56 ${formatClMobile(phone)}` : ""].filter(Boolean).join(" · ")}
            lines={lines}
            totalLabel={totalLabel}
            promoNote={promoNote}
            onEditTime={() => goStep(0)}
            onEditData={() => goStep(1)}
          />
        )}

        {showPay && (
          <PaySection
            n={n("04")}
            title={wizard ? "Pagar" : "Pago"}
            fullPoints={fullPoints}
            acceptedTerms={acceptedTerms}
            onAcceptedTerms={setAcceptedTerms}
            termsError={tried && missing?.step === "pago"}
            pointsApplied={pointsApplied}
            beatcoins={
              customer && (
                <BeatcoinsBlock
                  points={customer.points}
                  expiryNote={customer.pointsExpiryNote}
                  usePoints={usePoints}
                  onUsePoints={setUsePoints}
                  pointsApplied={pointsApplied}
                  earn={earnPreview}
                />
              )
            }
          />
        )}
      </div>

      {!wizard && (
        <SummaryCard
          title={pointsApplied > 0 ? "Total a pagar" : "Total"}
          volLabel={volPct > 0 ? `−${Math.round(volPct * 100)}%` : null}
          dateLabel={dateLabel}
          rangeLabel={rangeLabel}
          lines={lines}
          quoting={quoting}
          totalLabel={totalLabel}
          promoNote={promoNote}
          cta={cta}
          error={error}
          under={under}
        />
      )}

      {wizard && (
        <BottomBar
          sub={dateLabel && rangeLabel ? `${dateLabel} · ${rangeLabel}` : "Selecciona un horario"}
          totalLabel={totalLabel}
          onBack={step > 0 ? () => goStep(step - 1) : null}
          error={error}
          under={step === 0 ? "El total se actualiza al elegir horario" : step === 1 ? "Tus datos se piden una sola vez" : under}
          action={
            step === 2 ? (
              cta
            ) : (
              <Button
                fullWidth
                onClick={() => {
                  const blocked = step === 0 ? selectedStart === null : missing?.step === "datos";
                  if (blocked) goToMissing();
                  else goStep(step + 1);
                }}
              >
                {tried && step === 0 && selectedStart === null
                  ? "Selecciona un horario"
                  : tried && step === 1 && missing?.step === "datos"
                    ? missing.label
                    : step === 0
                      ? "Continuar"
                      : "Revisar y pagar"}
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
