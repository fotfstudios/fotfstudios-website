import Link from "next/link";
import { DateTime } from "luxon";
import { hhmm } from "@/components/booking/format";
import { agendaHref, chipSplit, wallMinutes, type AgendaQuery } from "@/src/domain/admin/agenda";
import type { DayCell } from "@/src/domain/scheduling/month-availability";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { DOT_CLS, eventAria, eventTitle, TONE_CLS, toneOf } from "./tones";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MAX_CHIPS = 3;

/**
 * Vista mes: grilla 6×7 con chips de eventos (desktop) o puntos (mobile).
 * El número del día lleva a la vista día; la celda vacía es quick-create
 * (solo desktop — en mobile el único blanco táctil es el número).
 */
export function MonthView({
  weeks,
  tz,
  today,
  query,
  byDay,
  closedDates,
}: {
  weeks: DayCell[][];
  tz: string;
  today: string;
  query: AgendaQuery;
  byDay: Record<string, AdminBooking[]>;
  /** Fechas cerradas para atenuar; null = horario desconocido (sin atenuar). */
  closedDates: Set<string> | null;
}) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-7">
        {WEEKDAYS.map((d) => (
          <div key={d} className="label-sm py-1 text-center text-bone-mute">
            {d}
          </div>
        ))}
      </div>

      <div role="presentation" className="grid grid-cols-7 gap-px border hairline bg-ink-line">
        {weeks.flat().map((cell) => {
          const events = byDay[cell.date] ?? [];
          const isToday = cell.date === today;
          const closed = closedDates?.has(cell.date) ?? false;
          const dt = DateTime.fromISO(cell.date).setLocale("es");
          const { visible, hiddenCount } = chipSplit(events, MAX_CHIPS);
          const dayHref = agendaHref(query, { view: "dia", date: cell.date }, today);
          return (
            <div
              key={cell.date}
              className={`group relative flex min-h-16 flex-col gap-1 p-1.5 md:min-h-28 ${
                cell.inMonth && !closed ? "bg-ink" : "bg-ink/60"
              } ${isToday ? "ring-1 ring-inset ring-gold/50" : ""}`}
            >
              <Link
                href={`/admin/reservas/nueva?d=${cell.date}`}
                tabIndex={-1}
                aria-hidden="true"
                className="absolute inset-0 z-0 hidden transition-colors hover:bg-ink-soft/60 md:block"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-1.5 bottom-1 z-0 hidden label-sm text-bone-mute opacity-0 transition-opacity group-hover:opacity-100 md:block"
              >
                +
              </span>

              <Link
                href={dayHref}
                aria-label={`Ver día, ${dt.toFormat("cccc d 'de' LLLL")}${isToday ? ", hoy" : ""}`}
                aria-current={isToday ? "date" : undefined}
                className={`relative z-10 self-start font-display text-base leading-none outline-none transition-colors hover:text-gold focus-visible:ring-1 focus-visible:ring-gold ${
                  isToday ? "text-gold" : cell.inMonth ? "text-bone" : "text-bone-mute/30"
                }`}
              >
                {dt.day}
              </Link>

              {/* desktop: chips */}
              <div className={`relative z-10 hidden flex-col gap-px md:flex ${cell.inMonth ? "" : "opacity-40"}`}>
                {visible.map((e) => {
                  const time = hhmm(wallMinutes(e.startsAt, cell.date, tz));
                  return (
                    <Link
                      key={e.id}
                      href={`/admin/reservas/${e.id}`}
                      aria-label={eventAria(e, time)}
                      className={`block truncate border-l-2 px-1 py-px font-mono text-[11px] leading-4 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-gold ${
                        TONE_CLS[toneOf(e)]
                      }`}
                    >
                      <span className="text-bone">{time}</span>{" "}
                      <span className="text-bone-dim">{eventTitle(e)}</span>
                    </Link>
                  );
                })}
                {hiddenCount > 0 && (
                  <Link href={dayHref} className="label-sm px-1 text-bone-mute transition-colors hover:text-gold">
                    +{hiddenCount} más
                  </Link>
                )}
              </div>

              {/* mobile: puntos + conteo */}
              {events.length > 0 && (
                <div className="relative z-10 flex items-center gap-1 md:hidden" aria-hidden="true">
                  {events.slice(0, 3).map((e) => (
                    <span key={e.id} className={`size-1.5 rounded-full ${DOT_CLS[toneOf(e)]}`} />
                  ))}
                  {events.length > 3 && <span className="label-sm text-bone-mute">+{events.length - 3}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
