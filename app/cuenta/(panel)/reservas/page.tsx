import type { Metadata } from "next";
import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import BookingList from "@/components/cuenta/BookingList";
import WhatsAppCta from "@/components/WhatsAppCta";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const metadata: Metadata = { title: "Mis reservas", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAST_SHOWN = 20;

/** Reservas del email verificado: próximas + pasadas (incluye las pre-cuenta). */
export default async function CuentaReservas() {
  const session = await requireCustomer();
  const { upcoming, past } = await customerService().bookings(session.email);

  return (
    <main className="space-y-8">
      <PageHeader title="Tus reservas" />

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon="bookings"
          title="Aún no tienes reservas"
          hint="Reserva tu primera hora en la sala y aparecerá aquí."
          action={<Button href="/reservar">Reservar una hora</Button>}
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="label text-bone-quiet">Próximas</h2>
            {upcoming.length === 0 ? (
              <EmptyState
                size="compact"
                icon="clock"
                title="Nada agendado"
                action={<Button href="/reservar" size="sm">Reservar</Button>}
              />
            ) : (
              <BookingList label="Próximas reservas" rows={upcoming} withLink />
            )}
            <p className="label-sm text-bone-quiet">
              ¿Necesitas cambiar una reserva?{" "}
              <WhatsAppCta
                source="cuenta-reservas"
                waMessage="Hola, necesito cambiar una reserva."
                className="text-gold transition-opacity hover:opacity-80"
              >
                Escríbenos por WhatsApp
              </WhatsAppCta>
              .
            </p>
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="label text-bone-quiet">Pasadas</h2>
              <BookingList label="Reservas pasadas" rows={past.slice(0, PAST_SHOWN)} />
              {past.length > PAST_SHOWN && (
                <p className="label-sm text-bone-quiet">Se muestran las últimas {PAST_SHOWN}.</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

