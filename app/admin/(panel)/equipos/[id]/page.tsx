import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDate, fmtDateTime, fmtDay } from "@/components/admin/format";
import { equipmentRepository } from "@/src/composition";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, positionLabel } from "@/src/domain/equipment/equipment";
import { formatCLP } from "@/src/domain/money/money";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";
import { EquipoFields } from "../_components/EquipoFields";
import { MoverForm } from "./_components/MoverForm";
import { removeEquipmentAction, updateDetailsAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo — Admin", robots: { index: false } };

/** Un id malformado va a 404, no a un error de Postgres (mismo guard que clientes). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EquipoDetalle({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("equipment.manage");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const repo = equipmentRepository();
  const item = await repo.get(id);
  if (!item) notFound();
  const [history, catalog] = await Promise.all([repo.history(item.id), repo.positions()]);
  const title = `${item.brand} ${item.model}`;

  return (
    <>
      <nav aria-label="Migas" className="label-sm flex items-center gap-2 text-bone-quiet">
        <Link href="/admin/equipos" className="hover:text-gold">
          Equipos
        </Link>
        <Icon name="chevron" size={12} />
        <span className="text-bone-dim">{title}</span>
      </nav>
      <header className="mt-4 border-b hairline pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl text-bone sm:text-4xl">{title}</h1>
          <StatusPill status={item.status} />
        </div>
        <p className="mt-2 font-mono text-xs text-bone-dim">
          {EQUIPMENT_CATEGORIES[item.category]}
          {item.nickname && <span className="ml-3">{item.nickname}</span>}
          {item.serialNumber && <span className="ml-3">S/N {item.serialNumber}</span>}
          {item.quantity > 1 && <span className="ml-3">×{item.quantity}</span>}
          <span className="ml-3 label-sm text-bone-quiet">Desde {fmtDate(item.createdAt)}</span>
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Ubicación">
            <p className="font-display text-2xl text-bone">{positionLabel(item)}</p>
            <p className="mt-1 label-sm text-bone-quiet">
              {item.locationName} · {EQUIPMENT_STATUSES[item.status]}
            </p>
            <div className="mt-5 border-t hairline pt-5">
              <h4 className="label text-bone-quiet">Mover</h4>
              <div className="mt-3">
                <MoverForm item={item} catalog={catalog} />
              </div>
            </div>
          </Card>

          <Card title="Detalles">
            <ActionForm action={updateDetailsAction} success="Equipo actualizado." className="space-y-4">
              <input type="hidden" name="id" value={item.id} />
              <EquipoFields d={item} quantityLocked={item.moveCount > 1} />
              <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Compra">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Fecha</dt>
                <dd className="text-bone-dim">{item.purchasedAt ? fmtDay(item.purchasedAt) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Precio</dt>
                <dd className="font-mono text-bone-dim">{item.purchasePriceClp !== null ? formatCLP(item.purchasePriceClp) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Proveedor</dt>
                <dd className="text-bone-dim">{item.vendor ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-bone-quiet">Garantía</dt>
                <dd className="text-bone-dim">{item.warrantyUntil ? fmtDay(item.warrantyUntil) : "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Historial">
            {history.length === 0 ? (
              <EmptyState size="compact" icon="clock" title="Sin movimientos" />
            ) : (
              <ol className="space-y-4">
                {history.map((m) => (
                  <li key={m.id} className="border-l-2 border-ink-edge pl-3">
                    <p className="font-mono text-xs text-bone-quiet">{fmtDateTime(m.movedAt)}</p>
                    <p className="mt-0.5 text-sm text-bone">
                      {m.from === null ? (
                        <>Alta en {positionLabel(m.to)}</>
                      ) : (
                        <>
                          {positionLabel(m.from)} → {positionLabel(m.to)}
                        </>
                      )}
                      {m.quantity > 1 && <span className="ml-2 font-mono text-xs text-bone-quiet">×{m.quantity}</span>}
                    </p>
                    {m.from !== null && m.from.status !== m.to.status && (
                      <p className="label-sm text-bone-quiet">
                        {EQUIPMENT_STATUSES[m.from.status]} → {EQUIPMENT_STATUSES[m.to.status]}
                      </p>
                    )}
                    {m.splitFromItemId && (
                      <p className="label-sm text-bone-quiet">
                        Separado de{" "}
                        <Link href={`/admin/equipos/${m.splitFromItemId}`} className="text-gold hover:underline">
                          otro lote
                        </Link>
                      </p>
                    )}
                    {m.note && <p className="mt-1 text-sm text-bone-dim">{m.note}</p>}
                    {m.movedByEmail && <p className="mt-0.5 label-sm text-bone-quiet">{m.movedByEmail}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Eliminar">
            <p className="text-sm text-bone-dim">Borra el equipo y todo su historial. Para sacarlo de circulación sin perder el registro, muévelo a “Dado de baja”.</p>
            <div className="mt-4">
              <ConfirmForm
                action={removeEquipmentAction}
                hidden={{ id: item.id }}
                trigger={{ label: "Eliminar equipo" }}
                title="Eliminar equipo"
                message={`Se borra ${title} y sus ${history.length} movimientos. No se puede deshacer.`}
                cta="Eliminar"
                success="Equipo eliminado."
                navigateTo="/admin/equipos"
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
