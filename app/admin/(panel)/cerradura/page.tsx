import Link from "next/link";
import { fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { adminRepository } from "@/src/composition";
import type { AccessWorkRow } from "@/src/infrastructure/db/admin-repository";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { markAccessLoadedAction, markAccessRemovedAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cerradura — Admin", robots: { index: false } };

/**
 * La lista de trabajo de la Yale: qué PIN hay que cargar hoy y cuál hay que borrar.
 * Es el mismo ciclo que la card de acceso de la ficha, visto desde la puerta y no
 * desde la reserva: el dueño llega al estudio, abre esto, y despacha todo de una.
 * Los contadores de "Por hacer" en Hoy bajan acá con #cargar y #quitar.
 */
export default async function CerraduraPage() {
  await requirePermission("reservations.access");
  const repo = adminRepository();
  const [toLoad, toRemove] = await Promise.all([repo.accessToLoad(), repo.accessToRemove()]);

  return (
    <>
      <PageHeader kicker="Operación" title="Cerradura" />

      <div id="cargar" className="mt-8 scroll-mt-8">
        <Card title={`Por cargar${toLoad.length ? ` · ${toLoad.length}` : ""}`}>
          {toLoad.length === 0 ? (
            <EmptyState size="compact" title="Nada que cargar" hint="Cada reserva confirmada recibe su PIN sola." />
          ) : (
            <>
              <PinList
                rows={toLoad}
                action={markAccessLoadedAction}
                success="PIN marcado como cargado."
                button="Ya está cargado"
                variant="primary"
              />
              <p className="mt-4 text-xs text-bone-mute">
                Cárgalo en la app de Yale y recién entonces márcalo: el correo al cliente sale 10 minutos antes de la
                sesión <strong className="text-bone-dim">solo si está marcado</strong>.
              </p>
            </>
          )}
        </Card>
      </div>

      <div id="quitar" className="mt-8 scroll-mt-8">
        <Card title={`Por quitar${toRemove.length ? ` · ${toRemove.length}` : ""}`}>
          {toRemove.length === 0 ? (
            <EmptyState size="compact" title="Nada que quitar" hint="La cerradura no tiene PIN de sesiones pasadas." />
          ) : (
            <>
              <PinList
                rows={toRemove}
                action={markAccessRemovedAction}
                success="PIN marcado como quitado."
                button="Ya lo quité"
                variant="secondary"
                past
              />
              <p className="mt-4 text-xs text-bone-mute">
                Estos códigos siguen abriendo la puerta. Bórralos en la app de Yale y márcalos acá.
              </p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * Una fila por PIN: cuándo, quién, el código grande y copiable, el botón que cierra
 * ese paso, y la ficha por si hay que ver más. El PIN se muestra entero a propósito:
 * en "por quitar" es lo que hay que buscar en la Yale para borrarlo.
 */
function PinList({
  rows,
  action,
  success,
  button,
  variant,
  past,
}: {
  rows: AccessWorkRow[];
  action: typeof markAccessLoadedAction;
  success: string;
  button: string;
  variant: "primary" | "secondary";
  past?: boolean;
}) {
  return (
    <ul className="divide-y divide-ink-line">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm text-bone">{r.customerName ?? "Sin nombre"}</p>
            <p className="label-sm mt-0.5 text-bone-mute">
              {past ? "Terminó" : "Empieza"} {fmtDateTime(past ? r.endsAt : r.startsAt)}
              {!past && !r.customerEmail && <span className="text-sirena"> · sin email: compártelo por WhatsApp</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl tracking-[0.2em] text-bone">{r.accessCode}</span>
            <CopyButton value={r.accessCode} label="Copiar PIN" />
            <ActionForm action={action} success={success}>
              <input type="hidden" name="reservationId" value={r.id} />
              <SubmitButton size="sm" variant={variant} pendingLabel="Guardando…">
                {button}
              </SubmitButton>
            </ActionForm>
            <Link href={`/admin/reservas/${r.id}`} className="label-sm text-gold transition-colors hover:text-bone">
              Ficha →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
