"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Icon } from "@/components/admin/ui/icons";
import { Skeleton } from "@/components/admin/ui/Skeleton";
import { btn } from "@/components/admin/ui/styles";
import { useToast } from "@/components/admin/ui/Toaster";
import { hhmm } from "@/components/booking/format";
import { formatCLP } from "@/src/domain/money/money";
import { overlaps } from "@/src/domain/scheduling/availability";
import { classifyReschedule } from "@/src/domain/scheduling/reschedule";
import type { DayStatus } from "@/src/domain/scheduling/month-availability";
import { nowMinuteInTz } from "@/src/domain/scheduling/time";
import { waLink } from "@/lib/whatsapp";
import { AdminCalendar } from "../../nueva/_components/AdminCalendar";
import { DayStrip } from "../../nueva/_components/DayStrip";
import { DurationStepper } from "../../nueva/_components/DurationStepper";
import { isRoomBlock } from "@/src/domain/scheduling/reservation-kind";
import { SlotGrid, type SlotView } from "../../nueva/_components/SlotGrid";
import type { DayConsoleData } from "../../nueva/types";
import { getRescheduleDayAction, rescheduleAction } from "../actions";

interface QuoteView {
  total: number;
}

/** Ventana "fuera de horario" para cortesías: 08:00–24:00 (igual que al crearlas). */
const OOH_START = 8 * 60;
const OOH_END = 24 * 60;

export function RescheduleDialog(props: {
  reservationId: string;
  /** Boleta viva actual (total − ya reembolsado), CLP. Base del delta. */
  oldLive: number;
  resourceId: string;
  tz: string;
  today: string;
  maxDate: string;
  initialMonth: string;
  addonKeys: string[];
  isOffline: boolean;
  /** Cortesía (sin orden): movimiento sin cobro — no se cotiza ni hay delta. */
  isCourtesy: boolean;
  customerPhone: string | null;
  volumeDiscounts: { minHours: number; pct: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btn("secondary", "sm")} onClick={() => setOpen(true)}>
        Reagendar
      </button>
      {open && (
        <Dialog title="Reagendar reserva" onClose={() => setOpen(false)}>
          <ReschedulePicker {...props} onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}

function ReschedulePicker({
  reservationId,
  oldLive,
  resourceId,
  tz,
  today,
  maxDate,
  initialMonth,
  addonKeys,
  isOffline,
  isCourtesy,
  customerPhone,
  volumeDiscounts,
  onClose,
}: Parameters<typeof RescheduleDialog>[0] & { onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();

  const [month, setMonth] = useState(initialMonth);
  const [dayStatus, setDayStatus] = useState<Record<string, DayStatus>>({});
  const [loadingMonth, setLoadingMonth] = useState(true);

  const [date, setDate] = useState(today);
  const [dayData, setDayData] = useState<DayConsoleData | null>(null);
  const [loadingDay, setLoadingDay] = useState(true);
  const [dayError, setDayError] = useState(false);

  const [start, setStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [quoteRes, setQuoteRes] = useState<{ key: string; quote: QuoteView | null; error: boolean } | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chargeLink, setChargeLink] = useState<{ initPoint: string; amount: number } | null>(null);
  /** Confirmación explícita post-éxito (el toast solo, se pierde con la vista en el dialog). */
  const [done, setDone] = useState<{ message: string; detail: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  /** Cierra y refresca la página de fondo (heading + línea de tiempo al día). */
  const finish = () => {
    onClose();
    router.refresh();
  };

  // Disponibilidad del mes (contador monotónico → gana la última respuesta).
  const monthReq = useRef(0);
  const loadMonth = useCallback(
    (m: string) => {
      const id = ++monthReq.current;
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
    },
    [resourceId],
  );

  // Día seleccionado (server action: ocupación sin la propia reserva).
  const dayReq = useRef(0);
  const loadDay = useCallback(
    (d: string) => {
      const id = ++dayReq.current;
      void getRescheduleDayAction(reservationId, d)
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
    },
    [reservationId],
  );

  // Carga inicial al abrir.
  useEffect(() => {
    loadMonth(initialMonth);
    loadDay(today);
  }, [loadMonth, loadDay, initialMonth, today]);

  const changeMonth = (m: string) => {
    setMonth(m);
    setLoadingMonth(true);
    loadMonth(m);
  };
  const selectDate = (d: string) => {
    if (d === date) return;
    setDate(d);
    setStart(null);
    setLoadingDay(true);
    setDayError(false);
    loadDay(d);
  };
  const retryDay = () => {
    setLoadingDay(true);
    setDayError(false);
    loadDay(date);
  };

  // ── derivados
  const nowMin = nowMinuteInTz(tz);
  const avail = dayData?.avail ?? null;
  const occupancy = dayData?.occupancy ?? [];
  const open = avail && !avail.closed ? avail.openMinute : 0;
  const close = avail && !avail.closed ? avail.closeMinute : 0;

  const buildSlot = (m: number, outOfHours: boolean, windowEnd: number): SlotView => {
    const hour = { start: m, end: m + 60 };
    const full = { start: m, end: m + duration * 60 };
    const hits = occupancy.filter((o) => overlaps(hour, o));
    if (hits.length > 0) {
      const isBlock = hits.some((o) => isRoomBlock(o.kind));
      return { minute: m, tag: isBlock ? "bloqueo" : "ocupado", disabled: true, warn: false };
    }
    if (full.end > windowEnd || occupancy.some((o) => overlaps(full, o))) {
      return { minute: m, tag: "no alcanza", disabled: true, warn: false };
    }
    // A diferencia de crear una cortesía, mover AL pasado no tiene sentido: el
    // service lo rechaza (target_past) y acá queda deshabilitado.
    const isPast = date < today || (date === today && m <= nowMin);
    if (isPast) return { minute: m, tag: "pasado", disabled: true, warn: false };
    return { minute: m, tag: null, disabled: false, warn: outOfHours };
  };

  const slots: SlotView[] = [];
  for (let m = open; m + 60 <= close; m += 60) slots.push(buildSlot(m, false, close));

  // Cortesía: ventana fuera de horario 08:00–24:00 (igual que al crearla). En un
  // día cerrado open=close=0 → toda la ventana queda disponible como OOH.
  const oohSlots: SlotView[] = [];
  if (isCourtesy && avail) {
    for (let m = OOH_START; m + 60 <= OOH_END; m += 60) {
      if (m >= open && m < close) continue; // ya listado en el horario normal
      oohSlots.push(buildSlot(m, true, OOH_END));
    }
  }

  const selectedSlot =
    start !== null ? ([...slots, ...oohSlots].find((s) => s.minute === start && !s.disabled) ?? null) : null;
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

  // Cotización en vivo (debounce + abort). Delta = classify(oldLive, total).
  // Cortesía: sin plata no hay cotización (quoteKey null → el effect no corre).
  const quoteKey = !isCourtesy && selectedStart !== null ? `${date}|${selectedStart}|${duration}` : null;
  useEffect(() => {
    if (quoteKey === null || selectedStart === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const qs = new URLSearchParams({
        resource: resourceId,
        date,
        start: String(selectedStart),
        duration: String(duration),
        addons: addonKeys.join(","),
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
  }, [quoteKey, resourceId, date, selectedStart, duration, addonKeys]);

  const quote = quoteKey !== null && quoteRes?.key === quoteKey ? quoteRes.quote : null;
  const quoting = quoteKey !== null && quoteRes?.key !== quoteKey;
  const delta = quote ? classifyReschedule(oldLive, quote.total) : null;

  const canSubmit = selectedStart !== null && (isCourtesy || quote !== null) && !pending && !loadingDay;

  const submit = () => {
    if (selectedStart === null) return;
    setSubmitError(null);
    startTransition(async () => {
      const res = await rescheduleAction({ reservationId, date, startMinute: selectedStart, durationHours: duration });
      if (!res.ok) {
        setSubmitError(res.error);
        toast({ tone: "error", message: res.error });
        return;
      }
      if (res.data.kind === "charge_pending") {
        // Más caro: no se mueve todavía. Se muestra el link de pago para enviárselo
        // al cliente; la reserva se mueve cuando pague (webhook).
        setChargeLink({ initPoint: res.data.initPoint, amount: res.data.amount });
        toast({ tone: "ok", message: "Cobro creado. Envía el link al cliente." });
        return;
      }
      // Confirmación explícita en el dialog (el toast se auto-oculta en segundos y
      // durante la espera la vista está acá, no en la esquina): queda a la vista
      // hasta que el dueño cierre con "Listo".
      const movedTo = `${DateTime.fromISO(date).setLocale("es").toFormat("ccc d LLL")} · ${hhmm(selectedStart)}–${hhmm(
        selectedStart + duration * 60,
      )}`;
      if (res.data.kind === "refunded") {
        setDone({
          message: `Reserva reagendada a ${movedTo}.`,
          detail: res.data.offline
            ? `Registra la devolución de ${formatCLP(res.data.amount)} al cliente (pago offline: la haces tú por transferencia/efectivo).`
            : `Se reembolsaron ${formatCLP(res.data.amount)} al medio de pago original.`,
        });
      } else if (res.data.kind === "refund_looped_back") {
        setDone({
          message: "El reembolso ya había sido procesado por Mercado Pago.",
          detail: "La reserva quedó cancelada por esa vía (no reagendada). Revisa el estado y reagenda de nuevo si corresponde.",
        });
        return;
      } else {
        setDone({ message: `Reserva reagendada a ${movedTo}.`, detail: isCourtesy ? "Cortesía — sin cobro." : null });
      }
      toast({ tone: "ok", message: "Reserva reagendada." });
    });
  };

  const dayLabel = DateTime.fromISO(date).setLocale("es").toFormat("ccc d LLL");
  const selectionLabel =
    selectedStart !== null ? `${dayLabel} · ${hhmm(selectedStart)}–${hhmm(selectedStart + duration * 60)} · ${duration}h` : null;

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-bone">
          <span className="mt-0.5 text-gold">
            <Icon name="check" size={16} />
          </span>
          <span>{done.message}</span>
        </p>
        {done.detail && <p className="text-sm leading-relaxed text-bone-dim">{done.detail}</p>}
        <p className="label-sm text-bone-mute">El cambio quedó registrado en la actividad de la reserva.</p>
        <div className="flex justify-end pt-1">
          <button type="button" onClick={finish} className={btn("primary", "sm")}>
            Listo
          </button>
        </div>
      </div>
    );
  }

  if (chargeLink) {
    const waMsg = `Hola, para confirmar tu nuevo horario en FOTF Studios necesitamos un cobro adicional de ${formatCLP(chargeLink.amount)}. Paga aquí: ${chargeLink.initPoint}`;
    const waHref = customerPhone ? waLink(customerPhone, waMsg) : null;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-bone-dim">
          Se creó un cobro de <strong className="text-bone">{formatCLP(chargeLink.amount)}</strong>. Envía este link al
          cliente; la reserva se moverá automáticamente cuando pague (si el horario sigue libre).
        </p>
        <a href={chargeLink.initPoint} target="_blank" rel="noreferrer" className={btn("primary", "sm")}>
          Abrir link de pago
        </a>
        {waHref ? (
          <a href={waHref} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
            Enviar por WhatsApp
          </a>
        ) : (
          <p className="label-sm text-bone-mute">Sin teléfono del cliente para WhatsApp; copia el link manualmente.</p>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={finish} className={btn("secondary", "sm")}>
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
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
        <div className="flex flex-col gap-4">
          <div>
            <span className="label-sm text-bone-mute">Duración</span>
            <div className="mt-2">
              <DurationStepper duration={duration} maxDuration={maxDuration} volumeDiscounts={volumeDiscounts} onChange={setDuration} />
            </div>
          </div>
          <div>
            <span className="label-sm text-bone-mute">Horarios</span>
            <div className="mt-2">
              {loadingDay ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : dayError ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="label-sm text-sirena">No se pudo cargar la disponibilidad.</p>
                  <button type="button" onClick={retryDay} className={btn("secondary", "sm")}>
                    Reintentar
                  </button>
                </div>
              ) : avail?.closed && !isCourtesy ? (
                <p className="label-sm py-6 text-bone-mute">Cerrado ese día.</p>
              ) : (
                <>
                  {avail?.closed && (
                    <p className="label-sm mb-2 text-bone-mute">Cerrado ese día — una cortesía puede ir fuera de horario.</p>
                  )}
                  <SlotGrid slots={slots} outOfHours={oohSlots} selected={selectedStart} onSelect={setStart} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {!loadingDay && !dayError && !avail?.closed && (
        <DayStrip
          open={open}
          close={close}
          occupancy={occupancy}
          selection={selectedStart !== null ? { start: selectedStart, end: selectedStart + duration * 60 } : null}
        />
      )}

      {/* Resumen del cambio + delta */}
      <div className="border-t hairline pt-4">
        {selectionLabel ? (
          <>
            <p className="text-sm text-bone">{selectionLabel}</p>
            <div className="mt-2 label-sm">
              {isCourtesy ? (
                <span className="text-bone-dim">
                  Cortesía — se moverá sin cobro.
                  {selectedOoh && <span className="text-sirena"> Fuera del horario de apertura.</span>}
                </span>
              ) : quoting ? (
                <span className="text-bone-mute">Calculando…</span>
              ) : delta?.kind === "equal" ? (
                <span className="text-bone-dim">Mismo precio — se moverá de inmediato.</span>
              ) : delta?.kind === "refund" ? (
                <span className="text-bone-dim">
                  Se reembolsará <strong className="text-bone">{formatCLP(delta.amount)}</strong>
                  {isOffline ? " — la devolución al cliente la haces tú (offline)." : " al medio de pago original."}
                </span>
              ) : delta?.kind === "charge" ? (
                <span className="text-bone-dim">
                  Cuesta <strong className="text-bone">{formatCLP(delta.amount)}</strong> más. Se generará un cobro; la
                  reserva se mueve cuando el cliente pague.
                </span>
              ) : (
                <span className="text-bone-mute">—</span>
              )}
            </div>
          </>
        ) : (
          <p className="label-sm text-bone-mute">Elige un nuevo día y horario.</p>
        )}
      </div>

      {submitError && <p className="label-sm text-sirena">{submitError}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className={btn("secondary", "sm")}>
          Volver
        </button>
        <button type="button" onClick={submit} disabled={!canSubmit} className={btn("primary", "sm")}>
          {pending ? "Reagendando…" : "Confirmar reagendamiento"}
        </button>
      </div>
    </div>
  );
}
