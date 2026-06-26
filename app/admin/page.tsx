import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy — Admin", robots: { index: false } };

export default async function AdminHome() {
  const repo = adminRepository();
  const [upcoming, boletas] = await Promise.all([repo.upcomingBookings(20), repo.pendingBoletas()]);
  const ingreso = upcoming.reduce((s, b) => s + (b.amount ?? 0), 0);

  return (
    <AdminShell>
      <PageHeader
        kicker="Panel"
        title="Hoy"
        editorial="El pulso del día, claro."
        action={
          <Button href="/admin/reservas/nueva" icon="add">
            Nueva reserva
          </Button>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Próximas sesiones" value={String(upcoming.length)} />
        <Stat label="Boletas pendientes" value={String(boletas.length)} accent={boletas.length > 0} />
        <Stat label="Ingreso próximo" value={formatCLP(ingreso)} />
      </div>

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label text-bone-mute">Próximas sesiones</h2>
          <Link href="/admin/reservas" className="label-sm text-gold transition-colors hover:text-bone">
            Ver todas
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            icon="today"
            title="Sin sesiones próximas"
            hint="Cuando entren reservas o crees una manual, aparecerán acá."
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
            {upcoming.map((b) => (
              <Tr key={b.id}>
                <Td className="whitespace-nowrap font-mono text-bone">{fmtDateTime(b.startsAt)}</Td>
                <Td className="text-bone-dim">{b.customerName ?? b.customerEmail ?? "—"}</Td>
                <Td>
                  <StatusPill status={b.status} />
                </Td>
                <Td right className="whitespace-nowrap font-mono text-bone">
                  {b.amount ? formatCLP(b.amount) : "—"}
                </Td>
                <Td right>
                  <Link
                    href={`/admin/reservas/${b.id}`}
                    aria-label="Ver reserva"
                    className="inline-flex text-bone-mute transition-colors hover:text-gold"
                  >
                    <Icon name="chevron" size={18} />
                  </Link>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </div>

      {boletas.length > 0 && (
        <div className="mt-10">
          <Card title="Boletas pendientes de emitir">
            <ul className="divide-y divide-ink-line">
              {boletas.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm text-bone">{d.kind === "boleta" ? "Boleta" : "Nota de crédito"}</p>
                    <p className="label-sm mt-0.5 text-bone-mute">
                      Neto {formatCLP(d.neto)} · IVA {formatCLP(d.iva)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-xl text-bone">{formatCLP(d.total)}</span>
                    <Link href={`/admin/reservas/${d.orderId}`} className="label-sm text-gold transition-colors hover:text-bone">
                      Ir al pedido
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-bone-mute">Emítelas en el portal del SII y registra el folio en cada reserva.</p>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border hairline bg-ink/40 p-5">
      <p className="label-sm text-bone-mute">{label}</p>
      <p className={`font-display mt-2 text-4xl ${accent ? "text-gold" : "text-bone"}`}>{value}</p>
    </div>
  );
}
