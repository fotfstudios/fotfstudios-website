import { DateTime } from "luxon";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { adminRepository, availabilityService, pricingService } from "@/src/composition";
import { todayInTz } from "@/src/domain/scheduling/time";
import BookingConsole from "./_components/BookingConsole";
import { loadDayConsole } from "./day-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva manual — Admin", robots: { index: false } };

/** Horizonte de reserva del admin (el público usa 90 días). */
const HORIZON_DAYS = 180;

export default async function NuevaReserva() {
  const resource = await adminRepository().defaultResource();

  const header = (
    <PageHeader kicker="Operación" title="Reserva manual" editorial="Walk-in, teléfono o WhatsApp." />
  );

  if (!resource) {
    return (
      <>
        {header}
        <div className="mt-8">
          <EmptyState icon="alert" title="No hay sala configurada" hint="Crea un recurso activo para reservar." />
        </div>
      </>
    );
  }

  // Precarga completa del primer render (hoy preseleccionado): el walk-in se
  // atiende sin ningún fetch del cliente.
  const today = todayInTz(resource.timezone);
  const initialMonth = today.slice(0, 7);
  const maxDate = DateTime.fromISO(today).plus({ days: HORIZON_DAYS }).toFormat("yyyy-MM-dd");
  const [catalog, monthAvail, initialDay] = await Promise.all([
    pricingService().getCatalog(resource.id),
    availabilityService().getMonthAvailability(resource.id, initialMonth),
    loadDayConsole(resource.id, resource.timezone, today),
  ]);

  return (
    <>
      {header}
      <BookingConsole
        resourceId={resource.id}
        tz={resource.timezone}
        today={today}
        maxDate={maxDate}
        initialMonth={initialMonth}
        initialMonthStatus={monthAvail.ok ? monthAvail.value.days : {}}
        initialDay={initialDay}
        addons={catalog?.addons ?? []}
        volumeDiscounts={catalog?.volumeDiscounts ?? []}
      />
    </>
  );
}
