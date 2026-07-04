import Link from "next/link";
import { DateTime } from "luxon";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { hhmm } from "@/components/booking/format";
import { wallMinutes, wallMinutesEnd } from "@/src/domain/admin/agenda";
import { eventAria, eventTitle, TONE_CLS, toneOf } from "./tones";
import type { GridDay } from "./TimeGrid";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Semana en mobile: 7 días apilados con sus eventos y quick-create por día. */
export function AgendaList({ days, tz, today }: { days: GridDay[]; tz: string; today: string }) {
  return (
    <div className="flex flex-col gap-2">
      {days.map((d) => {
        const isToday = d.date === today;
        const isPast = d.date < today;
        const dt = DateTime.fromISO(d.date).setLocale("es");
        const dayLabel = dt.toFormat("cccc d 'de' LLLL");
        return (
          <section key={d.date} className={`border hairline ${isToday ? "ring-1 ring-inset ring-gold/50" : ""}`}>
            <header
              aria-current={isToday ? "date" : undefined}
              className={`flex items-baseline gap-2 border-b hairline px-3 py-2 ${isToday ? "bg-gold/10" : "bg-ink/40"}`}
            >
              <span className={`label-sm ${isToday ? "text-gold" : "text-bone-mute"}`}>{cap(dt.toFormat("ccc"))}</span>
              <span className={`font-display text-lg ${isToday ? "text-gold" : "text-bone"}`}>{dt.day}</span>
            </header>
            <div className="flex flex-col gap-1.5 p-2">
              {d.events.map((e) => {
                const time = `${hhmm(wallMinutes(e.startsAt, d.date, tz))}–${hhmm(wallMinutesEnd(e.endsAt, d.date, tz))}`;
                return (
                  <Link
                    key={e.id}
                    href={`/admin/reservas/${e.id}`}
                    aria-label={eventAria(e, time, dayLabel)}
                    className={`flex items-center justify-between gap-3 border-l-2 px-2.5 py-1.5 transition-colors ${
                      TONE_CLS[toneOf(e)]
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-bone">{time}</span>
                      <span className="mt-0.5 block truncate text-xs text-bone-dim">{eventTitle(e)}</span>
                    </span>
                    <StatusPill status={e.kind === "block" ? "block" : e.status} />
                  </Link>
                );
              })}
              {!isPast && (
                <Link
                  href={`/admin/reservas/nueva?d=${d.date}`}
                  className="label-sm block px-2.5 py-2 text-bone-mute/60 transition-colors hover:bg-ink-soft hover:text-gold"
                >
                  + Crear reserva
                </Link>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
