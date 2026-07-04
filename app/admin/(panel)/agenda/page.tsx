import { Button } from "@/components/admin/ui/Button";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { adminRepository } from "@/src/composition";
import {
  agendaRange,
  axisWindow,
  effectiveHours,
  eventsByDay,
  parseAgendaSearchParams,
  wallMinutes,
  type AgendaView,
} from "@/src/domain/admin/agenda";
import { dayBoundsUtc, todayInTz } from "@/src/domain/scheduling/time";
import { AgendaHeader } from "./_components/AgendaHeader";
import { AgendaList } from "./_components/AgendaList";
import { MonthView } from "./_components/MonthView";
import { TimeGrid, type GridDay } from "./_components/TimeGrid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda — Admin", robots: { index: false } };

const FALLBACK_TZ = "America/Santiago";

const EMPTY: Record<AgendaView, string> = {
  dia: "Sin reservas este día.",
  semana: "Sin reservas esta semana.",
  mes: "Sin reservas este mes.",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const repo = adminRepository();
  const resource = await repo.defaultResource();
  const tz = resource?.timezone ?? FALLBACK_TZ;
  const today = todayInTz(tz);
  const q = parseAgendaSearchParams(sp, today);
  const range = agendaRange(q);

  const [bookings, schedule] = await Promise.all([
    repo.bookingsOverlapping(
      dayBoundsUtc(range.days[0], tz).startUtc,
      dayBoundsUtc(range.days[range.days.length - 1], tz).endUtc,
    ),
    repo.analyticsSchedule(),
  ]);

  const byDay = eventsByDay(range.days, tz, bookings);
  // Sin horario configurado no se atenúa nada (desconocido ≠ cerrado).
  const scheduleKnown = schedule.openingHours.length > 0;
  const hoursFor = (date: string): [number, number] | null =>
    scheduleKnown ? effectiveHours(date, tz, schedule.openingHours, schedule.exceptions) : null;

  const nReservas = bookings.filter((b) => b.kind !== "block").length;
  const nBloqueos = bookings.length - nReservas;

  let content: React.ReactNode;
  if (q.view === "mes") {
    const closedDates = scheduleKnown ? new Set(range.days.filter((d) => hoursFor(d) === null)) : null;
    content = (
      <MonthView weeks={range.weeks!} tz={tz} today={today} query={q} byDay={byDay} closedDates={closedDates} />
    );
  } else {
    const gridDays: GridDay[] = range.days.map((date) => ({ date, events: byDay[date], hours: hoursFor(date) }));
    const axis = axisWindow(
      gridDays.map((d) => d.hours),
      gridDays.flatMap((d) =>
        d.events.map((e) => ({
          start: wallMinutes(e.startsAt, d.date, tz),
          end: wallMinutes(e.endsAt, d.date, tz),
        })),
      ),
    );
    const grid = (variant: "week" | "day") => (
      <TimeGrid
        days={gridDays}
        tz={tz}
        today={today}
        query={q}
        axisStart={axis.start}
        axisEnd={axis.end}
        variant={variant}
        shadeClosed={scheduleKnown}
      />
    );
    content =
      q.view === "dia" ? (
        grid("day")
      ) : (
        <>
          <div className="hidden md:block">{grid("week")}</div>
          <div className="md:hidden">
            <AgendaList days={gridDays} tz={tz} today={today} />
          </div>
        </>
      );
  }

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Agenda"
        editorial="El calendario de la cabina."
        action={
          <Button href={`/admin/reservas/nueva?d=${q.date}`} size="sm" icon="add">
            Nueva reserva
          </Button>
        }
      />
      <div className="mt-8">
        <AgendaHeader query={q} today={today} />
        {bookings.length === 0 ? (
          <p className="mb-3 label-sm text-bone-mute">{EMPTY[q.view]}</p>
        ) : (
          <p className="sr-only">
            {nReservas} {nReservas === 1 ? "reserva" : "reservas"} y {nBloqueos}{" "}
            {nBloqueos === 1 ? "bloqueo" : "bloqueos"} en la vista.
          </p>
        )}
        {content}
      </div>
    </>
  );
}
