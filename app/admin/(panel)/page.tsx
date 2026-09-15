import Link from "next/link";
import { type ReactNode } from "react";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon, type IconName } from "@/components/admin/ui/icons";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { adminRepository, notificationLogRepository } from "@/src/composition";
import type { AdminBooking } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hoy — Admin", robots: { index: false } };

export default async function AdminHome() {
  // Correos que no salieron en 24 h: la única señal de una caída del proveedor
  // (2026-07-10 pasó días sin que nadie lo viera). Best-effort: si la bitácora no
  // responde, el panel igual carga.
  const [d, correos] = await Promise.all([
    adminRepository().dashboard(),
    notificationLogRepository().recentFailures(24).catch((e) => {
      console.error("[admin:correos]", e);
      return [];
    }),
  ]);

  const pendientes = (
    [
      { n: d.pendingBoletas, icon: "doc", label: "Documentos por emitir en el SII", href: "/admin/sii" },
      { n: d.pendingPayments, icon: "clock", label: "Pagos pendientes", href: "/admin/reservas" },
      { n: d.accessToLoad, icon: "lock", label: "PIN por cargar en la cerradura", href: "/admin/cerradura#cargar" },
      { n: d.accessToRemove, icon: "lock", label: "PIN por quitar de la cerradura", href: "/admin/cerradura#quitar" },
      { n: correos.length, icon: "alert", label: "Correos que no salieron (24 h)", href: "#correos" },
    ] as { n: number; icon: IconName; label: string; href: string }[]
  ).filter((x) => x.n > 0);

  return (
    <>
      <PageHeader
        kicker="Panel"
        title="Hoy"
        action={
          <Button href="/admin/reservas/nueva" icon="add">
            Nueva reserva
          </Button>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                      <Icon name={p.icon} size={16} className="text-bone-quiet" />
                      <span className="text-sm text-bone">{p.label}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-display text-lg text-gold">{p.n}</span>
                      <Icon name="chevron" size={16} className="text-bone-quiet" />
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

      {correos.length > 0 && (
        <div id="correos" className="mt-10 scroll-mt-8">
          <Card title="Correos que no salieron">
            <ul className="divide-y divide-ink-line">
              {correos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-bone">
                      {c.subject} <span className="text-bone-quiet">→ {c.recipient}</span>
                    </p>
                    {/* Sirena: urgencia real — un cliente no recibió lo que la app dice que mandó. */}
                    <p className="label-sm mt-0.5 text-sirena">{c.error}</p>
                  </div>
                  <span className="label-sm text-bone-quiet">{fmtDateTime(c.createdAt)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-bone-quiet">
              Revisa el estado de Resend y la API key en Vercel; si el proveedor volvió, la confirmación de
              una reserva pagada se reintenta sola con el cron diario. El resto hay que reenviarlo a mano.
            </p>
          </Card>
        </div>
      )}

      {d.pendingBoletas > 0 && (
        <div className="mt-10">
          <Card title="Documentos por emitir en el SII">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-3xl text-bone">
                  {d.pendingBoletas} <span className="text-base text-bone-dim">{d.pendingBoletas === 1 ? "documento" : "documentos"}</span>
                </p>
                {d.oldestPendingDocAt && (
                  <p className="mt-1 text-sm text-bone-dim">El más antiguo espera desde el {fmtDate(d.oldestPendingDocAt)}.</p>
                )}
              </div>
              <Button href="/admin/sii" icon="doc">
                Ir a SII
              </Button>
            </div>
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
        <h2 className="label text-bone-quiet">{title}</h2>
        {href && (
          <Link href={href} className="label-sm -my-2 inline-block py-2 text-gold transition-colors hover:text-bone">
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
        <Tr key={b.id} className="group relative focus-within:bg-ink-soft">
          <Td className="whitespace-nowrap font-mono text-bone">{fmtDateTime(b.startsAt)}</Td>
          <Td className="text-bone-dim">{b.customerName ?? b.customerEmail ?? "—"}</Td>
          <Td>
            <StatusPill status={b.status} />
          </Td>
          <Td right className="whitespace-nowrap font-mono text-bone">
            {b.amount ? formatCLP(b.amount) : "—"}
          </Td>
          <Td right>
            {/* Enlace "estirado": el ::after cubre toda la fila (Tr es relative), así
                la fila entera es el objetivo táctil — mismo patrón que BookingsTable. */}
            <Link
              href={`/admin/reservas/${b.id}`}
              aria-label={`Ver reserva de ${b.customerName ?? b.customerEmail ?? "cliente"} — ${fmtDateTime(b.startsAt)}`}
              className="inline-flex text-bone-quiet outline-none transition-colors after:absolute after:inset-0 group-hover:text-gold focus-visible:after:border focus-visible:after:border-gold"
            >
              <Icon name="chevron" size={18} />
            </Link>
          </Td>
        </Tr>
      ))}
    </DataTable>
  );
}

