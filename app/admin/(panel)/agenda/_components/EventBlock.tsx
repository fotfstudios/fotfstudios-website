import Link from "next/link";
import { DateTime } from "luxon";
import { fmtTimeRange } from "@/components/admin/format";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { hhmm } from "@/components/booking/format";
import { wallMinutes, wallMinutesEnd } from "@/src/domain/admin/agenda";
import { dayBoundsUtc } from "@/src/domain/scheduling/time";
import { formatCLP } from "@/src/domain/money/money";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { eventAria, eventTitle, TONE_CLS, toneOf } from "./tones";

/**
 * Evento posicionado en la grilla horaria (top/height por minutos de reloj).
 * Un evento que continúa fuera de la columna (bloqueo multi-día) se recorta al
 * eje con borde punteado en el extremo recortado.
 */
export function EventBlock({
  b,
  date,
  tz,
  axisStart,
  axisEnd,
  hourPx,
  lane,
  variant,
}: {
  b: AdminBooking;
  date: string;
  tz: string;
  axisStart: number;
  axisEnd: number;
  hourPx: number;
  lane: number;
  variant: "week" | "day";
}) {
  const startMin = Math.max(wallMinutes(b.startsAt, date, tz), axisStart);
  const endMin = Math.min(wallMinutesEnd(b.endsAt, date, tz), axisEnd);
  if (endMin <= startMin) return null; // fuera del eje (defensivo)

  const bounds = dayBoundsUtc(date, tz);
  const spansBefore = Date.parse(b.startsAt) < Date.parse(bounds.startUtc);
  const spansAfter = Date.parse(b.endsAt) > Date.parse(bounds.endUtc);
  const fullDay = spansBefore && spansAfter;

  const top = ((startMin - axisStart) / 60) * hourPx;
  const height = ((endMin - startMin) / 60) * hourPx;
  // Rango de la PORCIÓN visible en esta columna (para multi-día difiere del evento).
  const timeLabel = fullDay ? "todo el día" : `${hhmm(startMin)}–${hhmm(endMin)}`;
  const title = eventTitle(b);
  // En la grilla semanal la columna es el único indicio visual del día — el aria lo verbaliza.
  const dayLabel =
    variant === "week" ? DateTime.fromISO(date).setLocale("es").toFormat("cccc d 'de' LLLL") : undefined;

  return (
    <Link
      href={`/admin/reservas/${b.id}`}
      aria-label={eventAria(b, timeLabel, dayLabel)}
      className={`absolute overflow-hidden border-l-2 ring-1 ring-ink outline-none transition-colors focus-visible:ring-gold ${
        TONE_CLS[toneOf(b)]
      } ${spansBefore ? "border-t border-t-bone-mute/50 [border-top-style:dashed]" : ""} ${
        spansAfter ? "border-b border-b-bone-mute/50 [border-bottom-style:dashed]" : ""
      } ${variant === "day" ? "flex items-start justify-between gap-4 px-3 py-2" : "flex flex-col px-1.5 py-1"}`}
      style={{
        top: top + 1,
        height: Math.max(height - 2, hourPx - 2),
        left: 2 + lane * 10,
        right: 2,
        zIndex: 10 + lane,
      }}
    >
      {variant === "week" ? (
        <>
          <p className="truncate font-mono text-[11px] leading-4 text-bone">{timeLabel}</p>
          <p className="truncate text-xs leading-4 text-bone-dim">{title}</p>
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-baseline gap-3">
            <span className="shrink-0 font-mono text-xs text-bone">
              {spansBefore || spansAfter ? timeLabel : fmtTimeRange(b.startsAt, b.endsAt, tz)}
            </span>
            <span className="truncate text-sm text-bone">{title}</span>
            {b.customerPhone && (
              <span className="hidden shrink-0 font-mono text-xs text-bone-mute lg:inline">{b.customerPhone}</span>
            )}
            {b.notes && <Icon name="doc" size={14} className="shrink-0 self-center text-bone-mute" />}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {b.amount != null && (
              <span className="hidden font-mono text-xs text-bone-dim sm:inline">{formatCLP(b.amount)}</span>
            )}
            <StatusPill status={b.kind === "block" ? "block" : b.status} />
          </span>
        </>
      )}
    </Link>
  );
}
