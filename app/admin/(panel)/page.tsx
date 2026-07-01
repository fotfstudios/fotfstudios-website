import Link from "next/link";
import { type ReactNode } from "react";
import { fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon, type IconName } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { adminRepository } from "@/src/composition";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy — Admin", robots: { index: false } };

export default async function AdminHome() {
  const d = await adminRepository().dashboard();

  const pendientes = (
    [
      { n: d.pendingBoletas, icon: "doc", label: "Boletas por emitir", href: "#boletas" },
      { n: d.pendingPayments, icon: "clock", label: "Pagos pendientes", href: "/admin/reservas" },
      { n: d.accessToSend, icon: "today", label: "Accesos por enviar", href: "/admin/reservas" },
    ] as { n: number; icon: IconName; label: string; href: string }[]
  ).filter((x) => x.n > 0);

  return (
    <>
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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sesiones de hoy" value={String(d.todaySessions)} />
        <Stat label="Ingresos de la semana" value={formatCLP(d.weekRevenue)} />
        <Stat label="Ocupación de la semana" value={`${d.weekOccupancyPct}%`} />
        <Stat label="Boletas pendientes" value={String(d.pendingBoletas)} accent={d.pendingBoletas > 0} />
      </div>

      {pendientes.length > 0 && (
        <div className="mt-8">
          <Card title="Por hacer" bodyClassName="p-0">
            <ul>
              {pendientes.map((p) => (
                <li key={p.label} className="border-b hairline last:border-0">
                  <Link
                    href={p.href}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-soft"
                  >
                    <span className="flex items-center gap-3">
                      <Icon name={p.icon} size={16} className="text-bone-mute" />
                      <span className="text-sm text-bone">{p.label}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-display text-lg text-gold">{p.n}</span>
                      <Icon name="chevron" size={16} className="text-bone-mute" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Section title="Agenda de hoy">
        {d.today.length === 0 ? <EmptyState size="compact" title="Sin sesiones hoy" /> : <BookingsTable rows={d.today} />}
      </Section>

      <Section title="Próximas sesiones" href="/admin/reservas">
        {d.upcoming.length === 0 ? (
          <EmptyState size="compact" title="Nada agendado aún" />
        ) : (
          <BookingsTable rows={d.upcoming} />
        )}
      </Section>

      {d.boletas.length > 0 && (
        <div id="boletas" className="mt-10 scroll-mt-8">
          <Card title="Boletas pendientes de emitir">
            <ul className="divide-y divide-ink-line">
              {d.boletas.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm text-bone">{doc.kind === "boleta" ? "Boleta" : "Nota de crédito"}</p>
                    <p className="label-sm mt-0.5 text-bone-mute">
                      Neto {formatCLP(doc.neto)} · IVA {formatCLP(doc.iva)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-xl text-bone">{formatCLP(doc.total)}</span>
                    <Link
                      href={`/admin/reservas/${doc.orderId}`}
                      className="label-sm text-gold transition-colors hover:text-bone"
                    >
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
    </>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label text-bone-mute">{title}</h2>
        {href && (
          <Link href={href} className="label-sm text-gold transition-colors hover:text-bone">
            Ver todas
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}


function BookingsTable({ rows }: { rows: AdminBooking[] }) {
  return (
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
      {rows.map((b) => (
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
