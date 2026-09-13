import { Button } from "@/components/admin/ui/Button";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { fmtPts } from "@/components/cuenta/format";
import MovementList from "@/components/cuenta/MovementList";
import { formatCLP } from "@/lib/pricing";
import { customerService } from "@/src/composition";
import { requireCustomer } from "@/src/infrastructure/auth/require-customer";
import NextSession from "./_components/NextSession";

export const dynamic = "force-dynamic";

const SHOWN = 20;

/**
 * Resumen: la próxima sesión primero (es a lo que el DJ viene desde el teléfono),
 * los puntos como recompensa en una línea — o como protagonista si no hay nada
 * agendado — y el historial al final. Sin fila de KPI tiles: eso era el dashboard
 * del admin trasplantado.
 */
export default async function CuentaResumen() {
  const session = await requireCustomer();
  const svc = customerService();
  const [profile, movements, { upcoming }] = await Promise.all([
    svc.profileByUser(session.userId),
    svc.movementsByUser(session.userId, 200),
    svc.bookings(session.email),
  ]);

  const next = upcoming[0] ?? null;
  const balance = profile?.pointsBalance ?? 0;
  const earned = movements.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const redeemed = movements
    .filter((m) => m.kind === "redeem")
    .reduce((s, m) => s + Math.abs(m.amount), 0);
  const firstName = profile?.name?.trim().split(/\s+/)[0];

  return (
    <main className="space-y-8">
      <PageHeader title={firstName ? `Hola, ${firstName}` : "Hola"} />

      {next && <NextSession booking={next} />}

      {movements.length === 0 ? (
        <EmptyState
          icon="points"
          title="Aún no tienes puntos"
          hint="Reserva tu primera sesión y empieza a sumar: cada peso pagado te devuelve el 5% en puntos."
          action={<Button href="/reservar">Reservar una hora</Button>}
        />
      ) : (
        <>
          {next ? (
            // Con sesión agendada los puntos son una línea: recompensa, no ledger.
            <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
              <p className="text-sm leading-relaxed text-bone-dim">
                {balance > 0 ? (
                  <>
                    Tienes <strong className="font-mono text-gold">{fmtPts(balance)} pts</strong> — valen{" "}
                    {formatCLP(balance)} en tu próxima hora.
                  </>
                ) : (
                  <>Sin puntos por ahora — cada hora pagada te devuelve el 5% en tu próxima hora.</>
                )}
              </p>
              {balance > 0 && (
                <Button href="/reservar" icon="points">
                  Usar en una reserva
                </Button>
              )}
            </section>
          ) : (
            // Sin sesión agendada, el saldo es el protagonista y la CTA es reservar.
            <section aria-labelledby="tus-puntos" className="border hairline bg-ink/40 p-5 sm:p-6">
              <h2 id="tus-puntos" className="label text-bone-quiet">
                Tus puntos
              </h2>
              <p className={`font-display mt-3 text-4xl sm:text-5xl ${balance > 0 ? "text-gold" : "text-bone"}`}>
                {fmtPts(balance)} pts
              </p>
              <p className="mt-1 text-sm leading-relaxed text-bone-dim">
                {balance > 0
                  ? `Valen ${formatCLP(balance)} en tu próxima hora.`
                  : "Cada hora pagada te devuelve el 5% en tu próxima hora."}
              </p>
              <div className="mt-5">
                <Button href="/reservar" icon="points">
                  {balance > 0 ? "Usar en una reserva" : "Reservar una hora"}
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="label text-bone-quiet">Historial</h2>
              <p className="label-sm text-bone-quiet">
                Ganados {fmtPts(earned)} · Canjeados {fmtPts(redeemed)}
              </p>
            </div>
            <MovementList label="Historial de puntos" rows={movements.slice(0, SHOWN)} />
            {movements.length > SHOWN && (
              <p className="label-sm text-bone-quiet">Se muestran los últimos {SHOWN} movimientos.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
