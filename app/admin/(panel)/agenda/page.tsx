import { DateTime } from "luxon";
import { AgendaWeek } from "@/components/admin/AgendaWeek";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { adminRepository } from "@/src/composition";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda — Admin", robots: { index: false } };

const TZ = "America/Santiago";

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const base = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? DateTime.fromISO(w, { zone: TZ }) : DateTime.now().setZone(TZ);
  const weekStart = base.startOf("week"); // lunes
  const weekEnd = weekStart.plus({ weeks: 1 });

  const bookings = await adminRepository().bookingsBetween(weekStart.toUTC().toISO()!, weekEnd.toUTC().toISO()!);

  return (
    <>
      <PageHeader kicker="Operación" title="Agenda" editorial="La semana de un vistazo." />
      <div className="mt-8">
        <AgendaWeek weekStartISO={weekStart.toISODate()!} bookings={bookings} />
      </div>
    </>
  );
}
