import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate, fmtTimeRange } from "@/components/admin/format";
import { formatCLP } from "@/lib/pricing";
import WhatsAppCta from "@/components/WhatsAppCta";
import type { CustomerBooking } from "@/src/application/ports/customers";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const metadata: Metadata = { title: "Mis reservas — FOTF Studios", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAST_SHOWN = 20;

/** Reservas del email verificado: próximas + pasadas (incluye las pre-cuenta). */
export default async function CuentaReservas() {
  const session = await requireCustomer();
  const { upcoming, past } = await customerService().bookings(session.email);

  return (
    <main className="space-y-8">
      <PageHeader kicker="Mi cuenta" title="Tus reservas" editorial="Tu historial en la sala." />

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
            <h2 className="label text-bone-mute">Próximas</h2>
            {upcoming.length === 0 ? (
              <EmptyState
                size="compact"
                icon="clock"
                title="Nada agendado"
                action={<Button href="/reservar" size="sm">Reservar</Button>}
              />
            ) : (
              <BookingsTable rows={upcoming} withLink />
            )}
            <p className="label-sm text-bone-mute">
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
              <h2 className="label text-bone-mute">Pasadas</h2>
              <BookingsTable rows={past.slice(0, PAST_SHOWN)} />
              {past.length > PAST_SHOWN && (
                <p className="label-sm text-bone-mute">Se muestran las últimas {PAST_SHOWN}.</p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function BookingsTable({ rows, withLink }: { rows: CustomerBooking[]; withLink?: boolean }) {
  return (
    <DataTable
      head={
        <>
          <Th>Fecha</Th>
          <Th>Horario</Th>
          <Th>Estado</Th>
          <Th right>Total</Th>
          {withLink && <Th />}
        </>
      }
      minWidthClassName="min-w-[32rem]"
    >
      {rows.map((b) => {
        const total = (b.amountClp ?? 0) + b.pointsRedeemedClp;
        return (
          <Tr key={b.id} muted={b.status === "cancelled" || b.status === "expired"}>
            <Td>{fmtDate(b.startsAt)}</Td>
            <Td>{fmtTimeRange(b.startsAt, b.endsAt)}</Td>
            <Td>
              <StatusPill status={b.orderStatus === "pending_payment" ? "pending_payment" : b.status} />
            </Td>
            <Td right>
              <span className="font-mono">{b.orderId ? formatCLP(total) : "—"}</span>
              {b.pointsRedeemedClp > 0 && (
                <span className="label-sm block text-bone-mute">con puntos</span>
              )}
            </Td>
            {withLink && (
              <Td right>
                {b.orderId && (
                  <Link
                    href={`/reserva/estado?b=${b.orderId}`}
                    className="label-sm text-bone-dim transition-colors hover:text-gold"
                  >
                    Ver estado →
                  </Link>
                )}
              </Td>
            )}
          </Tr>
        );
      })}
    </DataTable>
  );
}
