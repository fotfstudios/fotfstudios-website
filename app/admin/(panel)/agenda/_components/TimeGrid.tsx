import Link from "next/link";
import { DateTime } from "luxon";
import { agendaHref, assignLanes, gridOrder, wallMinutes, type AgendaQuery } from "@/src/domain/admin/agenda";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { EventBlock } from "./EventBlock";
import { NowLine } from "./NowLine";

export interface GridDay {
  date: string;
  events: AdminBooking[];
  /** Horario efectivo [open, close) o null = cerrado. */
  hours: [number, number] | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Franjas fuera de horario dentro del eje (día cerrado = todo el eje). */
function closedRegions(
  hours: [number, number] | null,
  axisStart: number,
  axisEnd: number,
): Array<{ start: number; end: number }> {
  if (!hours) return [{ start: axisStart, end: axisEnd }];
  const regions = [
    { start: axisStart, end: Math.min(hours[0], axisEnd) },
    { start: Math.max(hours[1], axisStart), end: axisEnd },
  ];
  return regions.filter((r) => r.end > r.start);
}

/**
 * Grilla horaria compartida por las vistas día y semana: gutter de horas + una
 * columna `relative` por día. Capas por columna: z-0 un link por hora (líneas de
 * la grilla + quick-create, solo mouse/touch — el camino de teclado es el "+" del
 * encabezado), z-[5] sombreado de horas cerradas, z-10+ eventos absolutos por
 * minutos de RELOJ, z-30 la línea de ahora.
 */
export function TimeGrid({
  days,
  tz,
  today,
  query,
  axisStart,
  axisEnd,
  variant,
  shadeClosed,
}: {
  days: GridDay[];
  tz: string;
  today: string;
  query: AgendaQuery;
  axisStart: number;
  axisEnd: number;
  variant: "week" | "day";
  shadeClosed: boolean;
}) {
  const hourPx = variant === "day" ? 64 : 56;
  const bodyH = ((axisEnd - axisStart) / 60) * hourPx;
  const hourStarts: number[] = [];
  for (let m = axisStart; m < axisEnd; m += 60) hourStarts.push(m);

  return (
    <div
      className="grid border hairline"
      style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {/* ── encabezado ── */}
      <div className="border-b hairline" />
      {days.map((d) => {
        const isToday = d.date === today;
        const dt = DateTime.fromISO(d.date).setLocale("es");
        return (
          <div
            key={d.date}
            aria-current={isToday ? "date" : undefined}
            className={`border-b border-l hairline px-2.5 py-2 ${isToday ? "bg-gold/10" : "bg-ink/40"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={agendaHref(query, { view: "dia", date: d.date }, today)}
                aria-label={`Ver día, ${dt.toFormat("cccc d 'de' LLLL")}`}
                className="group outline-none focus-visible:ring-1 focus-visible:ring-gold"
              >
                <span className={`label-sm block ${isToday ? "text-gold" : "text-bone-mute"}`}>
                  {cap(dt.toFormat("ccc"))}
                </span>
                <span
                  className={`font-display text-lg transition-colors group-hover:text-gold ${
                    isToday ? "text-gold" : "text-bone"
                  }`}
                >
                  {dt.day}
                </span>
              </Link>
              <Link
                href={`/admin/reservas/nueva?d=${d.date}`}
                aria-label={`Crear reserva, ${dt.toFormat("cccc d 'de' LLLL")}`}
                className="label-sm px-1 py-0.5 text-bone-mute/60 outline-none transition-colors hover:text-gold focus-visible:ring-1 focus-visible:ring-gold"
              >
                +
              </Link>
            </div>
          </div>
        );
      })}

      {/* ── gutter de horas ── */}
      <div className="relative" style={{ height: bodyH }}>
        {hourStarts.slice(1).map((m) => (
          <span
            key={m}
            className="label-sm absolute right-2 -translate-y-1/2 text-bone-mute"
            style={{ top: ((m - axisStart) / 60) * hourPx }}
          >
            {String(m / 60).padStart(2, "0")}
          </span>
        ))}
      </div>

      {/* ── columnas de día ── */}
      {days.map((d) => {
        const ordered = gridOrder(d.events);
        const lanes = assignLanes(
          ordered.map((e) => ({ start: wallMinutes(e.startsAt, d.date, tz), end: wallMinutes(e.endsAt, d.date, tz) })),
        );
        return (
          <div key={d.date} className="relative border-l hairline" style={{ height: bodyH }}>
            {hourStarts.map((m, i) => (
              <Link
                key={m}
                href={`/admin/reservas/nueva?d=${d.date}&h=${m / 60}`}
                tabIndex={-1}
                aria-hidden="true"
                className={`group absolute inset-x-0 z-0 transition-colors hover:bg-ink-soft/60 ${
                  i > 0 ? "border-t hairline" : ""
                }`}
                style={{ top: i * hourPx, height: hourPx }}
              >
                <span className="pointer-events-none absolute top-0.5 right-1.5 label-sm text-bone-mute opacity-0 transition-opacity group-hover:opacity-100">
                  +
                </span>
              </Link>
            ))}

            {shadeClosed &&
              closedRegions(d.hours, axisStart, axisEnd).map((r) => (
                <div
                  key={r.start}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[5] bg-ink-soft/40"
                  style={{
                    top: ((r.start - axisStart) / 60) * hourPx,
                    height: ((r.end - r.start) / 60) * hourPx,
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, transparent 0 5px, rgba(30,29,26,0.55) 5px 6px)",
                  }}
                />
              ))}

            {ordered.map((e, i) => (
              <EventBlock
                key={e.id}
                b={e}
                date={d.date}
                tz={tz}
                axisStart={axisStart}
                axisEnd={axisEnd}
                hourPx={hourPx}
                lane={lanes[i]}
                variant={variant}
              />
            ))}

            <NowLine date={d.date} tz={tz} axisStart={axisStart} axisEnd={axisEnd} hourPx={hourPx} />
          </div>
        );
      })}
    </div>
  );
}
