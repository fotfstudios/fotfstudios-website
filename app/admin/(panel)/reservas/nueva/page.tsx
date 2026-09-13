import { DateTime } from "luxon";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { adminRepository, availabilityService, customerDirectory, pricingService } from "@/src/composition";
import { todayInTz } from "@/src/domain/scheduling/time";
import { hasPermission } from "@/src/domain/auth/permissions";
import { currentClaims } from "@/src/infrastructure/auth/require-admin";
import BookingConsole from "./_components/BookingConsole";
import { loadDayConsole } from "./day-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva manual — Admin", robots: { index: false } };

/** Horizonte de reserva del admin (el público usa 90 días). */
const HORIZON_DAYS = 180;

export default async function NuevaReserva({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; h?: string; c?: string }>;
}) {
  const { d, h, c } = await searchParams;
  const resource = await adminRepository().defaultResource();
  // ?c=<uuid>: llega desde "Nueva reserva" en la ficha del cliente. Se re-lee
  // en el servidor (nunca se confía en el id suelto) y si no existe se ignora.
  const initialCustomer = c && /^[0-9a-f-]{36}$/i.test(c) ? await customerDirectory().get(c) : null;
  // Solo para decidir si el resumen ofrece "Ver ficha →"; /admin/clientes exige
  // este mismo permiso, así que sin él el enlace llevaría a un 403.
  const canManageCustomers = hasPermission(await currentClaims(), "customers.manage");

  const header = (
    <PageHeader kicker="Operación" title="Reserva manual" />
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

  // Precarga completa del primer render: el walk-in se atiende sin ningún
  // fetch del cliente. La agenda prefija fecha/hora vía ?d=&h=; un prefill
  // inválido o fuera del horizonte degrada a hoy (la hora solo aplica si la
  // fecha fue aceptada — un slot ocupado/pasado queda simplemente sin selección).
  const today = todayInTz(resource.timezone);
  const maxDate = DateTime.fromISO(today).plus({ days: HORIZON_DAYS }).toFormat("yyyy-MM-dd");
  const validDate =
    d && /^\d{4}-\d{2}-\d{2}$/.test(d) && DateTime.fromISO(d).isValid && d >= today && d <= maxDate ? d : null;
  const initialDate = validDate ?? today;
  const hour = h && /^\d{1,2}$/.test(h) ? Number.parseInt(h, 10) : null;
  const initialStartMinute = validDate && hour != null && hour <= 23 ? hour * 60 : null;
  const initialMonth = initialDate.slice(0, 7);
  const [catalog, monthAvail, initialDay] = await Promise.all([
    pricingService().getCatalog(resource.id),
    availabilityService().getMonthAvailability(resource.id, initialMonth),
    loadDayConsole(resource.id, resource.timezone, initialDate),
  ]);

  return (
    <>
      {header}
      <BookingConsole
        // El prefill vive en useState: la key fuerza remount cuando cambia
        // (soft navigation al mismo segmento con otro ?d=&h= no re-monta sola).
        key={`${initialDate}:${initialStartMinute ?? ""}:${initialCustomer?.id ?? ""}`}
        resourceId={resource.id}
        tz={resource.timezone}
        today={today}
        maxDate={maxDate}
        initialDate={initialDate}
        initialStartMinute={initialStartMinute}
        initialMonth={initialMonth}
        initialMonthStatus={monthAvail.ok ? monthAvail.value.days : {}}
        initialDay={initialDay}
        addons={catalog?.addons ?? []}
        canManageCustomers={canManageCustomers}
        initialCustomer={initialCustomer}
        volumeDiscounts={catalog?.volumeDiscounts ?? []}
      />
    </>
  );
}
