import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Field, Input } from "@/components/admin/ui/Field";
import { Icon } from "@/components/admin/ui/icons";
import { Stat } from "@/components/admin/ui/Stat";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { fmtPts, fmtPtsSigned } from "@/components/cuenta/format";
import { customerDirectory } from "@/src/composition";
import { CUSTOMER_CAPS, customerLabel } from "@/src/domain/customers/customer-input";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { updateCustomerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente — Admin", robots: { index: false } };

/** Un id malformado va a 404, no a un error de Postgres (mismo guard que el curso). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOVEMENTS_SHOWN = 10;

export default async function ClienteDetalle({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customers.manage");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const dir = customerDirectory();
  const c = await dir.get(id);
  if (!c) notFound();
  const [movements, bookings] = await Promise.all([dir.movements(c.id, MOVEMENTS_SHOWN + 1), dir.bookings(c)]);

  const hasAccount = c.authUserId !== null;
  const upcoming = bookings.filter((b) => b.status === "confirmed" || b.status === "held");

  return (
    <>
      <nav aria-label="Migas" className="label-sm flex items-center gap-2 text-bone-mute">
        <Link href="/admin/clientes" className="hover:text-gold">
          Clientes
        </Link>
        <Icon name="chevron" size={12} />
        <span className="text-bone-dim">{customerLabel(c)}</span>
      </nav>
      <header className="mt-4 border-b hairline pb-6">
        <h1 className="font-display text-bone" style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>
          {customerLabel(c)}
        </h1>
        <p className="mt-2 font-mono text-xs text-bone-dim">
          {[c.email, c.phone].filter(Boolean).join(" · ") || "Sin contacto"}
          {hasAccount && <span className="ml-3 label-sm text-bone-mute">Con cuenta</span>}
          <span className="ml-3 label-sm text-bone-mute">Desde {fmtDate(c.createdAt)}</span>
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card title="Datos">
            <ActionForm action={updateCustomerAction} success="Cliente actualizado." className="max-w-md space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Nombre">
                <Input name="name" defaultValue={c.name ?? ""} maxLength={CUSTOMER_CAPS.name} autoComplete="off" />
              </Field>
              <Field
                label="Email"
                hint={
                  hasAccount
                    ? "Su email es su acceso a la cuenta y no se puede cambiar desde acá."
                    : "Opcional si hay teléfono. Los puntos se acumulan por email."
                }
              >
                <Input
                  name="email"
                  type="email"
                  defaultValue={c.email ?? ""}
                  maxLength={CUSTOMER_CAPS.email}
                  disabled={hasAccount}
                  autoComplete="off"
                />
                {/* Un input disabled no viaja en el FormData: el email del titular se reenvía tal cual. */}
                {hasAccount && <input type="hidden" name="email" value={c.email ?? ""} />}
              </Field>
              <Field label="Teléfono" hint="Opcional si hay email. +56 9 …">
                <Input name="phone" type="tel" defaultValue={c.phone ?? ""} maxLength={CUSTOMER_CAPS.phone} autoComplete="off" />
              </Field>
              <p className="label-sm text-bone-mute">
                Al guardar, el nombre y el teléfono se actualizan también en sus reservas y pedidos.
              </p>
              <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
            </ActionForm>
          </Card>

          <Card
            title="Reservas"
            action={
              <Button href={`/admin/reservas/nueva?c=${c.id}`} icon="add" size="sm">
                Nueva reserva
              </Button>
            }
          >
            {bookings.length === 0 ? (
              <EmptyState size="compact" icon="bookings" title="Sin reservas todavía" />
            ) : (
              <DataTable
                minWidthClassName="min-w-[32rem]"
                head={
                  <>
                    <Th>Sesión</Th>
                    <Th>Estado</Th>
                    <Th right>Monto</Th>
                  </>
                }
              >
                {bookings.map((b) => (
                  <Tr key={b.id} muted={b.status === "cancelled" || b.status === "expired"}>
                    <Td>
                      <Link href={`/admin/reservas/${b.id}`} className="text-bone hover:text-gold">
                        {fmtDateTime(b.startsAt)}
                      </Link>
                    </Td>
                    <Td>
                      <StatusPill status={b.status} />
                    </Td>
                    <Td right>
                      <span className="font-mono text-bone-dim">{b.amountClp !== null ? formatCLP(b.amountClp) : "—"}</span>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            )}
            {upcoming.length > 0 && (
              <p className="mt-3 label-sm text-bone-mute">
                {upcoming.length === 1 ? "1 reserva vigente" : `${upcoming.length} reservas vigentes`}
              </p>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Puntos FOTF">
            <Stat label="Disponibles" value={`${fmtPts(c.pointsBalance)} pts`} accent={c.pointsBalance > 0} />
            {!c.email && (
              <p className="mt-3 label-sm text-bone-mute">Los puntos se acumulan por email. Agrega uno para que sume.</p>
            )}
            {movements.length > 0 && (
              <ul className="mt-4 flex flex-col divide-y divide-bone/10">
                {movements.slice(0, MOVEMENTS_SHOWN).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex flex-col">
                      <StatusPill status={m.kind} />
                      <span className="label-sm mt-1 text-bone-mute">{fmtDate(m.createdAt)}</span>
                    </div>
                    <span className={`font-mono ${m.amount > 0 ? "text-gold" : "text-bone-dim"}`}>{fmtPtsSigned(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {movements.length > MOVEMENTS_SHOWN && (
              <p className="mt-2 label-sm text-bone-mute">Se muestran los últimos {MOVEMENTS_SHOWN} movimientos.</p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
