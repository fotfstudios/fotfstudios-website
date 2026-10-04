"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import type { ActionDataResult } from "@/components/admin/ui/action";
import { Field, Input } from "@/components/admin/ui/Field";
import { Skeleton } from "@/components/admin/ui/Skeleton";
import type { DayConsoleData } from "@/components/admin/day-occupancy";
import { hhmm } from "@/components/booking/format";
import { halfHourStarts } from "@/lib/course-admin";
import { pickerSlots } from "@/lib/slot-picker";
import { nowMinuteInTz } from "@/src/domain/scheduling/time";

/**
 * Elegir día y hora VIENDO la ocupación real de la sala: al cambiar el día se
 * carga lo agendado y cada hora muestra si está libre, ocupada o si la duración
 * no alcanza. Las horas son radios nativos (`required`, deshabilitados si chocan):
 * el formulario no se puede enviar con una hora tomada y el teclado funciona solo.
 * Los nombres de campo (`date`, `startMinute`) son los que ya leen las actions.
 */
export function SlotPicker({
  loadDay,
  durationMin,
  tz,
  defaultDate,
  defaultMinute,
  ignoreId,
  dateLabel = "Día",
  dateName = "date",
  minuteName = "startMinute",
}: {
  loadDay: (date: string) => Promise<ActionDataResult<DayConsoleData>>;
  durationMin: number;
  tz: string;
  defaultDate?: string;
  defaultMinute?: number;
  /** Reserva que no cuenta como ocupada: la propia sesión cuando se la mueve. */
  ignoreId?: string;
  dateLabel?: string;
  dateName?: string;
  minuteName?: string;
}) {
  const [date, setDate] = useState(defaultDate ?? "");
  const [day, setDay] = useState<{ date: string; data: DayConsoleData | null; error: boolean } | null>(null);
  const [minute, setMinute] = useState<number | null>(defaultMinute ?? null);

  const load = useCallback(
    async (d: string) => {
      const r = await loadDay(d);
      setDay({ date: d, data: r.ok ? r.data : null, error: !r.ok });
    },
    [loadDay],
  );

  // Solo la carga inicial (Editar abre con la fecha actual de la sesión). Los
  // cambios de día cargan desde el onChange, no desde un efecto.
  useEffect(() => {
    if (!defaultDate) return;
    let live = true;
    loadDay(defaultDate).then((r) => {
      if (live) setDay({ date: defaultDate, data: r.ok ? r.data : null, error: !r.ok });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez, al abrir
  }, []);

  const today = DateTime.now().setZone(tz).toISODate()!;
  const loading = Boolean(date) && day?.date !== date;
  const data = day?.date === date ? day.data : null;
  const slots = data
    ? pickerSlots({
        starts: halfHourStarts(),
        durationMin,
        occupancy: data.occupancy,
        ignoreId,
        open: data.avail.openMinute,
        close: data.avail.closeMinute,
        closed: data.avail.closed,
        dayIsPast: date < today,
        isToday: date === today,
        nowMinute: nowMinuteInTz(tz),
      })
    : [];
  // Si el día o la duración cambian y la hora elegida dejó de servir, se suelta.
  const chosen = slots.find((s) => s.minute === minute && !s.disabled) ? minute : null;

  return (
    <div className="flex flex-col gap-4">
      <Field label={dateLabel}>
        <Input
          type="date"
          name={dateName}
          required
          value={date}
          onChange={(e) => {
            const d = e.target.value;
            setDate(d);
            setMinute(null);
            if (d) void load(d);
          }}
        />
      </Field>

      <fieldset>
        <legend className="label text-bone-quiet">Hora</legend>
        {!date ? (
          <p className="label-sm mt-2 text-bone-quiet">Elige un día para ver qué horas están libres.</p>
        ) : loading ? (
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : day?.error || !data ? (
          <p role="alert" className="label-sm mt-2 text-sirena">
            No se pudo cargar la ocupación de ese día. Prueba de nuevo.
          </p>
        ) : (
          <>
            <div className="mt-2 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
              {slots.map((s) => (
                <label
                  key={s.minute}
                  className={
                    "flex min-h-10 cursor-pointer flex-col items-start justify-center border px-2.5 py-1.5 transition-colors " +
                    "has-focus-visible:ring-1 has-focus-visible:ring-gold " +
                    (s.disabled
                      ? "cursor-not-allowed border-ink-line text-bone-quiet opacity-50"
                      : chosen === s.minute
                        ? "border-gold bg-gold text-ink"
                        : "border-ink-edge text-bone hover:border-gold")
                  }
                >
                  <input
                    type="radio"
                    name={minuteName}
                    value={s.minute}
                    required
                    disabled={s.disabled}
                    checked={chosen === s.minute}
                    onChange={() => setMinute(s.minute)}
                    className="sr-only"
                  />
                  <span className="font-mono text-sm">{hhmm(s.minute)}</span>
                  {s.tag && (
                    <span className={`label-sm ${chosen === s.minute ? "text-ink" : s.disabled ? "" : "text-gold"}`}>
                      {s.tag}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <p className="label-sm mt-2 text-bone-quiet" aria-live="polite">
              {chosen !== null
                ? `${hhmm(chosen)}–${hhmm(chosen + durationMin)}${slots.find((s) => s.minute === chosen)?.tag ? " · fuera del horario de apertura" : ""}`
                : `Duración ${(durationMin / 60).toLocaleString("es-CL")} h. Las horas grises chocan con algo ya agendado.`}
            </p>
          </>
        )}
      </fieldset>
    </div>
  );
}
