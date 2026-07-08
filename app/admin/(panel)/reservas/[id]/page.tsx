import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { cancelBookingAction, markAccessAction, recordBoletaAction } from "./actions";
import { fmtDate, fmtDateTime, fmtDateTimeSec } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Input } from "@/components/admin/ui/Field";
import { Icon } from "@/components/admin/ui/icons";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { adminRepository, pricingService } from "@/src/composition";
import type { AdminBookingDetail, BookingTimelineEvent, PaymentSnapshot } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";
import { refundPolicy, reschedulePolicy, suggestedRefund } from "@/src/domain/scheduling/cancellation-policy";
import { todayInTz } from "@/src/domain/scheduling/time";
import { CancelBookingDialog } from "./_components/CancelBookingDialog";
import { CobroPendiente } from "./_components/CobroPendiente";
import { RescheduleDialog } from "./_components/RescheduleDialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserva — Admin", robots: { index: false } };

/** Categoría de cada evento del timeline de actividad (espejo de booking_events.category). */
type ActivityTag = "Reservas" | "Pagos" | "Puntos" | "Documentos tributarios" | "Notificaciones";

/**
 * Tono por categoría (leyenda + punto + chip). Familia oro = plata: oro vivo para
 * pagos en vivo, oro profundo para los documentos del SII, oro atenuado para los
 * puntos (dinero-equivalente que NO toca el banco). Los grises quedan para lo
 * administrativo. Sirena fuera — solo urgencia.
 */
const TAG_TONE: Record<ActivityTag, { dot: string; text: string }> = {
  Pagos: { dot: "bg-gold", text: "text-gold" },
  Puntos: { dot: "bg-gold/60", text: "text-gold/70" },
  "Documentos tributarios": { dot: "bg-gold-deep", text: "text-gold-deep" },
  Reservas: { dot: "bg-bone", text: "text-bone" },
  Notificaciones: { dot: "bg-bone-dim", text: "text-bone-dim" },
};
const TAG_ORDER: ActivityTag[] = ["Reservas", "Pagos", "Puntos", "Documentos tributarios", "Notificaciones"];

/** Renderiza un evento del log al par (label es-CL, detalle) del timeline. */
function timelineEntry(
  e: BookingTimelineEvent,
  ctx: { origin: string; originalStart: string; payMethod: string },
): { label: string; detail?: string } {
  const clp = (n: number | null) => (n != null ? formatCLP(n) : "");
  const move = () =>
    e.detail?.old_starts_at && e.detail?.new_starts_at
      ? `${fmtDateTime(e.detail.old_starts_at)} → ${fmtDateTime(e.detail.new_starts_at)}`
      : undefined;
  switch (e.type) {
    case "created":
      return { label: "Reserva creada", detail: `${ctx.origin} · ${fmtDateTime(ctx.originalStart)}` };
    case "courtesy_confirmed":
      return { label: "Confirmada (cortesía)" };
    case "payment_confirmed":
      return { label: "Pago confirmado", detail: `${clp(e.amountClp)} · ${ctx.payMethod}` };
    case "access_sent":
      return { label: "Acceso enviado" };
    case "reschedule_moved":
      return { label: "Reagendada", detail: move() };
    case "reschedule_charge_pending":
      return { label: "Reagendamiento pendiente de pago", detail: `${move() ?? ""} · ${clp(e.amountClp)} extra — se mueve al pagarse` };
    case "reschedule_charge_paid":
      return { label: "Cobro extra por reagendamiento", detail: clp(e.amountClp) };
    case "reschedule_refund":
      return { label: "Reembolso por reagendamiento", detail: clp(e.amountClp) };
    case "reschedule_failed_slot_taken":
      return { label: "Reagendamiento fallido (horario tomado)", detail: `${move() ?? ""} · excedente ${clp(e.amountClp)} devuelto` };
    case "reschedule_expired":
      return { label: "Cobro de reagendamiento expirado", detail: move() };
    case "boleta_issued":
      return { label: "Boleta generada", detail: clp(e.amountClp) };
    case "boleta_emitted":
      return { label: "Boleta emitida", detail: `${e.detail?.folio ? `Folio ${e.detail.folio} · ` : ""}${clp(e.amountClp)}` };
    case "nota_credito_issued":
      return { label: "Nota de crédito generada", detail: clp(e.amountClp) };
    case "nota_credito_emitted":
      return { label: "Nota de crédito emitida", detail: `${e.detail?.folio ? `Folio ${e.detail.folio} · ` : ""}${clp(e.amountClp)}` };
    case "points_earned":
      return { label: "Puntos otorgados", detail: e.amountClp != null ? `+${e.amountClp} pts` : undefined };
    case "points_revoked":
      return { label: "Puntos revocados", detail: e.amountClp != null ? `−${e.amountClp} pts` : undefined };
    case "cancelled":
      return { label: "Cancelada" };
    case "refunded":
      return { label: "Reembolsada", detail: clp(e.amountClp) };
    default:
      return { label: e.type };
  }
}

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await adminRepository().getBooking(id);
  if (!b) notFound();

  const isBlock = b.kind === "block";
  const isCourtesy = !isBlock && !b.orderId;
  const isPaid = !isBlock && !!b.paidAt; // pagada → puede reembolsarse

  // Reagendar: reservas pagadas (sin puntos, ≥12 h de anticipación) o cortesías
  // confirmadas (sin plata no aplica la política — misma flexibilidad que crearlas).
  // Los props del picker se calculan en el server (force-dynamic) solo si aplica.
  const canReschedule =
    b.status !== "cancelled" &&
    ((isPaid && b.pointsRedeemedClp === 0 && reschedulePolicy(b.startsAt).allowed) ||
      (isCourtesy && b.status === "confirmed"));
  const reschedProps = canReschedule ? await rescheduleDialogProps(b, isCourtesy) : null;


  const waDigits = (b.customerPhone ?? "").replace(/\D/g, "");

  // Enriquecimiento del render que depende del pedido (no vive en cada evento):
  // el origen de "Reserva creada" y el método de "Pago confirmado". El horario
  // original es el del primer reagendamiento aplicado (si lo hubo).
  const firstApplied = b.reschedules.find((m) => m.status === "applied");
  const originalStart = firstApplied ? firstApplied.oldStartsAt : b.startsAt;
  const origin = !b.orderId ? "cortesía (admin)" : b.mpPreferenceId ? "vía checkout web" : "manual (admin)";
  const snapshotMethod = b.paymentSnapshot ? mpMethodLabel(b.paymentSnapshot) : "—";
  const payMethod =
    snapshotMethod !== "—"
      ? snapshotMethod
      : b.mpPaymentId?.startsWith("offline:")
        ? `${b.mpPaymentId.slice("offline:".length)} (manual)`
        : "Mercado Pago";

  // Timeline: fuente ÚNICA y ya ordenada (booking_events, newest-first con `seq`).
  const events = await adminRepository().getBookingTimeline(b.id);
  const timeline = events.map((e) => {
    const { label, detail } = timelineEntry(e, { origin, originalStart, payMethod });
    return { label, detail, at: e.occurredAt, tag: e.category };
  });

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

          {/* Solo para holds vivos: expired/cancelled ya no tienen cupo que cobrar
              (ver BookingsTable "overdue", que excluye ambos por el mismo motivo). */}
          {b.orderId && b.orderStatus === "pending_payment" && b.status === "held" && (
            <Card title="Cobro">
              <p className="text-sm leading-relaxed text-bone-dim">
                Reserva pendiente de pago. Márcala pagada (efectivo/transferencia) o comparte un link de Mercado Pago.
              </p>
              <div className="mt-4">
                <CobroPendiente reservationId={b.id} amount={b.amount ?? 0} customerPhone={b.customerPhone} />
              </div>
            </Card>
          )}

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

          {reschedProps && (
            <Card title="Reagendar">
              <p className="text-sm leading-relaxed text-bone-dim">
                {isCourtesy
                  ? "Mueve la cortesía a otro horario. Sin cobro."
                  : "Mueve la sesión a otro horario. Si el nuevo horario cuesta menos, se reembolsa la diferencia al cliente."}
              </p>
              <div className="mt-4">
                <RescheduleDialog {...reschedProps} />
              </div>
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

      {/* Timeline de actividad: ancho completo, al final de la página. */}
      {!isBlock && (
        <div className="mt-6">
          <Card
            title="Actividad"
            action={
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                {TAG_ORDER.filter((t) => timeline.some((e) => e.tag === t)).map((t) => (
                  <span key={t} className={`inline-flex items-center gap-1.5 whitespace-nowrap label-sm ${TAG_TONE[t].text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${TAG_TONE[t].dot}`} />
                    {t}
                  </span>
                ))}
              </div>
            }
          >
            <ol className="flex flex-col gap-4">
              {timeline.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${TAG_TONE[a.tag].dot}`} />
                  <div className="-mt-0.5 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-bone">{a.label}</p>
                      <span className={`shrink-0 whitespace-nowrap border hairline px-2 py-0.5 label-sm ${TAG_TONE[a.tag].text}`}>
                        {a.tag}
                      </span>
                    </div>
                    {a.detail && <p className="mt-0.5 text-xs leading-relaxed text-bone-dim">{a.detail}</p>}
                    <p className="label-sm mt-0.5 text-bone-mute">{a.at ? fmtDateTimeSec(a.at) : "—"}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </>
  );
}

/** Props del picker de reagendamiento (sala default + catálogo), calculados en el server. */
async function rescheduleDialogProps(b: AdminBookingDetail, isCourtesy: boolean) {
  const resource = await adminRepository().defaultResource();
  if (!resource) return null;
  const today = todayInTz(resource.timezone);
  const catalog = isCourtesy ? null : await pricingService().getCatalog(resource.id);
  return {
    reservationId: b.id,
    oldLive: (b.amount ?? 0) - (b.refundedAmount ?? 0),
    resourceId: resource.id,
    tz: resource.timezone,
    today,
    maxDate: DateTime.fromISO(today).plus({ days: 180 }).toFormat("yyyy-MM-dd"),
    initialMonth: today.slice(0, 7),
    addonKeys: b.addonKeys,
    isOffline: !b.mpPaymentId || b.mpPaymentId.startsWith("offline:"),
    isCourtesy,
    customerPhone: b.customerPhone,
    volumeDiscounts: catalog?.volumeDiscounts ?? [],
  };
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
