import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBookingAction, markAccessAction, recordBoletaAction } from "./actions";
import { fmtDate, fmtDateTime } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Input } from "@/components/admin/ui/Field";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { adminRepository } from "@/src/composition";
import type { PaymentSnapshot } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";
import { refundPolicy, suggestedRefund } from "@/src/domain/scheduling/cancellation-policy";
import { CancelBookingDialog } from "./_components/CancelBookingDialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva — Admin", robots: { index: false } };

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await adminRepository().getBooking(id);
  if (!b) notFound();

  const isBlock = b.kind === "block";
  const isCourtesy = !isBlock && !b.orderId;
  const isPaid = !isBlock && !!b.paidAt; // pagada → puede reembolsarse


  const waDigits = (b.customerPhone ?? "").replace(/\D/g, "");

  const activity: { label: string; at: string | null }[] = [{ label: "Reserva creada", at: b.createdAt }];
  if (b.paidAt) activity.push({ label: "Pago confirmado", at: b.paidAt });
  else if (b.status === "confirmed" && !b.orderId) activity.push({ label: "Confirmada (cortesía)", at: null });
  if (b.accessSentAt) activity.push({ label: "Acceso enviado", at: b.accessSentAt });
  if (b.refundedAt) activity.push({ label: "Reembolsada", at: b.refundedAt });
  if (b.status === "cancelled") activity.push({ label: "Cancelada", at: b.cancelledAt });

  return (
    <>
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

              {b.taxDocs.length > 0 && (
                <Card title="Documentos tributarios">
                  <ul className="flex flex-col divide-y divide-bone/10">
                    {b.taxDocs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm text-bone">
                            {taxDocLabel(d.kind)} · {formatCLP(d.total)}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <StatusPill status={d.status} />
                            {d.folio && <span className="font-mono text-xs text-bone-dim">Folio {d.folio}</span>}
                          </div>
                        </div>
                        {d.status === "pendiente" && (
                          <ActionForm action={recordBoletaAction} success="Documento marcado como emitido.">
                            <input type="hidden" name="docId" value={d.id} />
                            <input type="hidden" name="reservationId" value={b.id} />
                            <div className="flex items-center gap-2">
                              <Input name="folio" placeholder="N° folio" />
                              <SubmitButton size="sm">Emitir</SubmitButton>
                            </div>
                          </ActionForm>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Sidebar derecha */}
        <aside className="flex flex-col gap-6">
          {b.notes && (
            <Card title="Notas">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-bone-dim">{b.notes}</p>
            </Card>
          )}

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

          {b.orderId && (b.mpPaymentId || b.paymentSnapshot) && (
            <Card title="Mercado Pago">
              {b.paymentSnapshot && (
                <div className="flex flex-col gap-2.5">
                  <MpRow label="Método" value={mpMethodLabel(b.paymentSnapshot)} />
                  {b.paymentSnapshot.fee_amount != null && (
                    <MpRow label="Comisión MP" value={`−${formatCLP(b.paymentSnapshot.fee_amount)}`} />
                  )}
                  {b.paymentSnapshot.net_received_amount != null && (
                    <MpRow label="Neto recibido" value={formatCLP(b.paymentSnapshot.net_received_amount)} />
                  )}
                </div>
              )}

              {b.refundedAt && (
                <div className="mt-3 border-t hairline pt-3">
                  <MpRow
                    label="Reembolsado"
                    value={`${formatCLP(b.refundedAmount && b.refundedAmount > 0 ? b.refundedAmount : (b.amount ?? 0))} · ${fmtDateTime(b.refundedAt)}`}
                  />
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 border-t hairline pt-4">
                {b.mpPaymentId && <MpIdRow label="Operación #" value={b.mpPaymentId} />}
                {b.mpRefundId && <MpIdRow label="Reembolso #" value={b.mpRefundId} />}
                {b.mpPreferenceId && <MpIdRow label="Preferencia" value={b.mpPreferenceId} />}
                {b.orderId && <MpIdRow label="Pedido (ref)" value={b.orderId} />}
              </div>

              {b.mpPaymentId && (
                <a
                  href="https://www.mercadopago.cl/activities"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 border hairline px-4 py-2 label-sm text-bone transition-colors hover:border-gold hover:text-gold"
                >
                  Ver actividad en Mercado Pago <Icon name="external" size={14} />
                </a>
              )}
            </Card>
          )}

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
              {isPaid ? (
                (() => {
                  // Política de cancelación calculada en el server (force-dynamic):
                  // sugiere el reembolso; el dueño decide en el dialog.
                  const liveBoleta = (b.amount ?? 0) - (b.refundedAmount ?? 0);
                  const tier = refundPolicy(b.startsAt);
                  return (
                    <>
                      <p className="text-sm leading-relaxed text-bone-dim">
                        Cancelar libera el horario. La política sugiere el reembolso según la
                        anticipación (<strong className="text-bone">≥24 h: total · 12–24 h: 50% · &lt;12 h: sin
                        reembolso</strong>) y tú decides el monto final.
                      </p>
                      <div className="mt-4">
                        <CancelBookingDialog
                          reservationId={b.id}
                          liveBoleta={liveBoleta}
                          policy={{
                            label: tier.label,
                            hoursUntil: tier.hoursUntil,
                            suggested: suggestedRefund(tier, liveBoleta),
                          }}
                          isOffline={!b.mpPaymentId || b.mpPaymentId.startsWith("offline:")}
                        />
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-bone-dim">Cancelar libera el horario.</p>
                  <div className="mt-4">
                    <ConfirmForm
                      action={cancelBookingAction}
                      hidden={{ reservationId: b.id, mode: "none" }}
                      trigger={{ label: isBlock ? "Cancelar bloqueo" : "Cancelar reserva", variant: "danger", size: "sm" }}
                      title={isBlock ? "Cancelar bloqueo" : "Cancelar reserva"}
                      message="Se liberará el horario. Esta acción no se puede deshacer."
                      cta={isBlock ? "Cancelar bloqueo" : "Cancelar reserva"}
                      success="Reserva cancelada."
                    />
                  </div>
                </>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function MpRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-sm text-bone-mute">{label}</span>
      <span className="text-sm text-bone">{value}</span>
    </div>
  );
}

function MpIdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-sm text-bone-mute">{label}</span>
      <span className="flex items-center gap-2 font-mono text-xs text-bone-dim">
        <span className="max-w-44 truncate">{value}</span>
        <CopyButton value={value} />
      </span>
    </div>
  );
}

const MP_BRAND: Record<string, string> = {
  master: "Mastercard",
  visa: "Visa",
  amex: "American Express",
};
const MP_PTYPE: Record<string, string> = {
  credit_card: "crédito",
  debit_card: "débito",
  account_money: "dinero en cuenta",
  ticket: "efectivo",
  bank_transfer: "transferencia",
};

function taxDocLabel(kind: string): string {
  return kind === "nota_credito" ? "Nota de crédito" : kind === "boleta" ? "Boleta" : kind;
}

function mpMethodLabel(s: PaymentSnapshot): string {
  const parts: string[] = [];
  if (s.payment_method_id) parts.push(MP_BRAND[s.payment_method_id] ?? s.payment_method_id);
  if (s.payment_type_id) parts.push(MP_PTYPE[s.payment_type_id] ?? s.payment_type_id);
  if (s.card_last4) parts.push(`••${s.card_last4}`);
  if (s.installments && s.installments > 1) parts.push(`· ${s.installments} cuotas`);
  return parts.join(" ") || "—";
}
