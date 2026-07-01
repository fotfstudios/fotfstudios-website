import { ReservasTable } from "@/components/admin/ReservasTable";
import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { adminRepository } from "@/src/composition";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservas — Admin", robots: { index: false } };

export default async function ReservasPage() {
  const bookings = await adminRepository().recentBookings(120);

  return (
    <>
      <PageHeader
        kicker="Operación"
        title="Reservas"
        editorial="Todo lo que pasa por la sala."
        action={
          <Button href="/admin/reservas/nueva" icon="add">
            Nueva reserva
          </Button>
        }
      />

      <div className="mt-8">
        {bookings.length === 0 ? (
          <EmptyState
            icon="bookings"
            title="Sin reservas todavía"
            hint="Las reservas pagadas en el sitio y las que crees manualmente aparecerán acá."
            action={
              <Button href="/admin/reservas/nueva" icon="add" size="sm">
                Nueva reserva
              </Button>
            }
          />
        ) : (
          <ReservasTable bookings={bookings} />
        )}
      </div>
    </>
  );
}
