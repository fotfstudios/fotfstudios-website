import Link from "next/link";
import { Button } from "@/components/admin/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/admin/ui/DataTable";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { fmtDate } from "@/components/admin/format";
import { fmtPts, fmtPtsSigned } from "@/components/cuenta/format";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";

export const dynamic = "force-dynamic";

const SHOWN = 50;

/** Resumen: saldo de puntos + historial de movimientos. */
export default async function CuentaResumen() {
  const session = await requireCustomer();
  const svc = customerService();
  const [profile, movements] = await Promise.all([
    svc.profile(session.userId),
    svc.movements(session.userId, 200),
  ]);

  const balance = profile?.pointsBalance ?? 0;
  const earned = movements.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const redeemed = movements
    .filter((m) => m.kind === "redeem")
    .reduce((s, m) => s + Math.abs(m.amount), 0);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Mi cuenta"
        title="Tus puntos"
        editorial="Cada sesión suma."
        action={
          <Button href="/reservar" icon="points">
            Usar en una reserva
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Disponibles" value={`${fmtPts(balance)} pts`} accent />
        <Stat label="Ganados" value={`${fmtPts(earned)} pts`} />
        <Stat label="Canjeados" value={`${fmtPts(redeemed)} pts`} />
      </div>

      {movements.length === 0 ? (
        <EmptyState
          icon="points"
          title="Aún no tienes puntos"
          hint="Reserva tu primera sesión y empieza a sumar: cada peso pagado te devuelve el 5% en puntos."
          action={<Button href="/reservar">Reservar una hora</Button>}
        />
      ) : (
        <section className="space-y-3">
          <h2 className="label text-bone-mute">Historial</h2>
          <DataTable head={<HistoryHead />} minWidthClassName="min-w-[30rem]">
            {movements.slice(0, SHOWN).map((m) => (
              <Tr key={m.id}>
                <Td>{fmtDate(m.createdAt)}</Td>
                <Td>
                  {m.orderId ? (
                    <Link
                      href={`/reserva/estado?b=${m.orderId}`}
                      className="text-bone-dim transition-colors hover:text-gold"
                    >
                      Reserva →
                    </Link>
                  ) : (
                    <span className="text-bone-mute">—</span>
                  )}
                </Td>
                <Td>
                  <StatusPill status={m.kind} />
                </Td>
                <Td right>
                  <span className={`font-mono ${m.amount > 0 ? "text-gold" : "text-bone-dim"}`}>
                    {fmtPtsSigned(m.amount)}
                  </span>
                </Td>
              </Tr>
            ))}
          </DataTable>
          {movements.length > SHOWN && (
            <p className="label-sm text-bone-mute">Se muestran los últimos {SHOWN} movimientos.</p>
          )}
        </section>
      )}
    </main>
  );
}

function HistoryHead() {
  return (
    <>
      <Th>Fecha</Th>
      <Th>Detalle</Th>
      <Th>Movimiento</Th>
      <Th right>Puntos</Th>
    </>
  );
}
