import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBookingAction, markAccessAction, recordBoletaAction } from "@/app/admin/actions";
import AdminShell from "@/components/admin/AdminShell";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { Input } from "@/components/admin/ui/Field";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { adminRepository } from "@/src/composition";
import { formatCLP } from "@/src/domain/money/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva — Admin", robots: { index: false } };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await adminRepository().getBooking(id);
  if (!b) notFound();

  const isBlock = b.kind === "block";
  const isCourtesy = !isBlock && !b.orderId;
  const waDigits = (b.customerPhone ?? "").replace(/\D/g, "");

  const activity: { label: string; at: string | null }[] = [{ label: "Reserva creada", at: b.createdAt }];
  if (b.paidAt) activity.push({ label: "Pago confirmado", at: b.paidAt });
  else if (b.status === "confirmed" && !b.orderId) activity.push({ label: "Confirmada (cortesía)", at: null });
  if (b.accessSentAt) activity.push({ label: "Acceso enviado", at: b.accessSentAt });
  if (b.status === "cancelled") activity.push({ label: "Cancelada", at: null });

  return (
    <AdminShell>
      <nav className="flex items-center gap-2 label-sm text-bone-mute">
        <Link href="/admin/reservas" className="transition-colors hover:text-gold">
          Reservas
        </Link>
        <Icon name="chevron" size={12} className="text-bone-mute/50" />
        <span className="text-bone-dim">{fmtDate(b.startsAt)}</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b hairline pb-6">
        <div>
          <h1 className="font-display text-bone" style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)" }}>
            {fmtDateTime(b.startsAt)}
          </h1>
          <p className="mt-2 flex items-center gap-2">
            <StatusPill status={b.status} />
            {isBlock && <span className="inline-flex items-center gap-1.5 label-sm text-bone-mute"><Icon name="block" size={13} /> Bloqueo</span>}
            {isCourtesy && <span className="label-sm text-gold">Cortesía</span>}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Columna principal */}
        <div className="flex flex-col gap-6">
          {b.lines.length > 0 && (
            <Card title="Detalle del pedido">
              <table className="w-full text-sm">
                <tbody>
                  {b.lines.map((l, i) => (
                    <tr key={i} className="border-b hairline last:border-0">
                      <td className="py-2.5 text-bone-dim">{l.description}</td>
                      <td className="py-2.5 text-right font-mono text-bone">{formatCLP(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {!isBlock && (
            <div className="grid gap-6 sm:grid-cols-2">
              <Card title="Acceso">
                <ActionForm action={markAccessAction} success="Acceso guardado.">
                  <input type="hidden" name="reservationId" value={b.id} />
                  <Input name="code" defaultValue={b.accessCode ?? ""} placeholder="Código o instrucciones" />
                  <div className="mt-3 flex items-center gap-3">
                    <SubmitButton size="sm">Guardar acceso</SubmitButton>
                    {b.accessSentAt && <span className="label-sm text-bone-mute">Registrado</span>}
                  </div>
                </ActionForm>
              </Card>

              {b.boleta && b.boleta.status === "pendiente" ? (
                <Card title="Registrar boleta">
                  <ActionForm action={recordBoletaAction} success="Boleta marcada como emitida.">
                    <input type="hidden" name="docId" value={b.boleta.id} />
                    <input type="hidden" name="reservationId" value={b.id} />
                    <Input name="folio" placeholder="N° de folio (SII)" />
                    <div className="mt-3">
                      <SubmitButton size="sm">Marcar emitida</SubmitButton>
                    </div>
                  </ActionForm>
                </Card>
              ) : (
                <Card title="Boleta">
                  {b.boleta ? (
                    <div className="flex items-center gap-2">
                      <StatusPill status={b.boleta.status} />
                      {b.boleta.folio && <span className="font-mono text-sm text-bone-dim">Folio {b.boleta.folio}</span>}
                    </div>
                  ) : (
                    <p className="text-sm text-bone-mute">Sin boleta.</p>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Sidebar derecha */}
        <aside className="flex flex-col gap-6">
          {!isBlock && (
            <Card title="Cliente">
              <p className="text-bone">{b.customerName ?? "Sin nombre"}</p>
              <p className="mt-0.5 text-sm text-bone-dim">{b.customerEmail ?? "Sin email"}</p>
              {b.customerPhone && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 border hairline px-4 py-2 label-sm text-bone transition-colors hover:border-gold hover:text-gold"
                >
                  <Icon name="whatsapp" size={15} /> WhatsApp
                </a>
              )}
            </Card>
          )}

          <Card title="Pago">
            <p className="font-display text-3xl text-bone">{b.amount ? formatCLP(b.amount) : "—"}</p>
            {b.orderStatus && (
              <div className="mt-3 flex items-center justify-between">
                <span className="label-sm text-bone-mute">Pedido</span>
                <StatusPill status={b.orderStatus} />
              </div>
            )}
          </Card>

          {!isBlock && (
            <Card title="Actividad">
              <ol className="flex flex-col gap-4">
                {activity.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-gold" />
                    <div className="-mt-0.5">
                      <p className="text-sm text-bone">{a.label}</p>
                      <p className="label-sm mt-0.5 text-bone-mute">{a.at ? fmtDateTime(a.at) : "—"}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {b.status !== "cancelled" && (
            <Card title="Zona de peligro">
              <p className="text-sm leading-relaxed text-bone-dim">
                Cancelar libera el horario{!isBlock ? " y, si estaba pagada, genera la nota de crédito" : ""}.
              </p>
              <div className="mt-4">
                <ConfirmForm
                  action={cancelBookingAction}
                  hidden={{ reservationId: b.id }}
                  trigger={{ label: isBlock ? "Cancelar bloqueo" : "Cancelar reserva", variant: "danger", size: "sm" }}
                  title={isBlock ? "Cancelar bloqueo" : "Cancelar reserva"}
                  message={`Se liberará el horario${!isBlock ? " y, si estaba pagada, se generará la nota de crédito" : ""}. Esta acción no se puede deshacer.`}
                  cta={isBlock ? "Cancelar bloqueo" : "Cancelar reserva"}
                  success="Reserva cancelada."
                />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
