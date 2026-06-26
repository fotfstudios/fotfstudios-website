import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservas — Admin", robots: { index: false } };

export default async function ReservasPage() {
  const bookings = await adminRepository().recentBookings(80);

  return (
    <AdminShell>
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
          <DataTable
            head={
              <>
                <Th>Cuándo</Th>
                <Th>Cliente</Th>
                <Th>Estado</Th>
                <Th right>Monto</Th>
                <Th />
              </>
            }
          >
            {bookings.map((b) => {
              const isBlock = b.kind === "block";
              return (
                <Tr key={b.id} muted={isBlock}>
                  <Td className="whitespace-nowrap font-mono text-bone">{fmtDateTime(b.startsAt)}</Td>
                  <Td className="text-bone-dim">
                    {isBlock ? (
                      <span className="inline-flex items-center gap-1.5 label-sm text-bone-mute">
                        <Icon name="block" size={13} /> Bloqueo
                      </span>
                    ) : (
                      (b.customerName ?? b.customerEmail ?? "—")
                    )}
                  </Td>
                  <Td>
                    <StatusPill status={b.status} />
                  </Td>
                  <Td right className="whitespace-nowrap font-mono text-bone">
                    {b.amount ? formatCLP(b.amount) : "—"}
                  </Td>
                  <Td right>
                    <Link
                      href={`/admin/reservas/${b.id}`}
                      aria-label="Ver detalle"
                      className="inline-flex text-bone-mute transition-colors hover:text-gold"
                    >
                      <Icon name="chevron" size={18} />
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </AdminShell>
  );
}
