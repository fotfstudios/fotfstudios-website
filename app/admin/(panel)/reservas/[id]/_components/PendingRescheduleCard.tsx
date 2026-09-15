"use client";

import { cancelRescheduleChargeAction, retryRescheduleRefundAction } from "../actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Icon } from "@/components/admin/ui/icons";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { waLink } from "@/lib/whatsapp";
import { formatSessionWhen } from "@/src/application/notifications/format-when";
import type { AdminBookingDetail } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

type Pending = AdminBookingDetail["reschedules"][number];

/**
 * Reagendamiento pendiente (H3/H5/H1): a lo más UNA fila `pending_charge`/`pending_refund`
 * por reserva (índice único de la migración). `pending_charge`: la sesión sigue en su
 * horario ORIGINAL hasta que el cliente pague o se anule el cobro. `pending_refund`
 * (H1): la sesión YA se movió al horario nuevo; lo que falta es que Mercado Pago
 * devuelva la diferencia — mientras tanto cancelar y reagendar quedan bloqueados
 * (page.tsx) para no cruzar dos flujos de plata a la vez.
 */
export function PendingRescheduleCard({
  reservationId,
  pending,
  tz,
  customerPhone,
}: {
  reservationId: string;
  pending: Pending;
  tz: string;
  customerPhone: string | null;
}) {
  switch (pending.kind) {
    case "charge": {
      const waMsg = pending.initPoint
        ? `Hola, para confirmar tu nuevo horario en FOTF Studios necesitamos un cobro adicional de ${formatCLP(pending.deltaClp)}. Paga aquí: ${pending.initPoint}`
        : null;
      const waHref = waMsg && customerPhone ? waLink(customerPhone, waMsg) : null;
      const holdUntil = pending.holdExpiresAt ? formatSessionWhen(pending.holdExpiresAt, tz) : null;
      return (
        <Card title="Reagendamiento pendiente">
          <p className="text-sm leading-relaxed text-bone-dim">
            Cobro de {formatCLP(pending.deltaClp)} por mover a{" "}
            {formatSessionWhen(pending.newStartsAt, tz, { endsAt: pending.newEndsAt })}. La reserva se mueve
            cuando el cliente pague.
          </p>
          {/* El cupo nuevo está reservado por un hold sin orden (migración 20260915120000): nadie
              más lo puede tomar mientras dure el link. Si venció, el pago igual intenta mover
              la reserva y, si el cupo ya no está, se devuelve solo. */}
          <p className="mt-2 label-sm text-bone-quiet">
            {holdUntil
              ? `Cupo reservado para el cliente hasta el ${holdUntil}.`
              : "El cupo ya no está reservado (venció el plazo): si el cliente paga y el horario sigue libre, se mueve igual; si no, se le devuelve el cobro."}
          </p>
          {pending.initPoint && (
            <div className="mt-3 flex flex-col gap-2.5">
              <a href={pending.initPoint} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
                <Icon name="external" size={14} /> Abrir link de pago
              </a>
              {waHref ? (
                <a href={waHref} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
                  <Icon name="whatsapp" size={14} /> Enviar por WhatsApp
                </a>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="label-sm text-bone-quiet">Sin teléfono del cliente; copia el link.</p>
                  <CopyButton value={pending.initPoint} />
                </div>
              )}
            </div>
          )}
          <div className="mt-4">
            <ConfirmForm
              action={cancelRescheduleChargeAction}
              hidden={{ reservationId, rescheduleId: pending.id }}
              trigger={{ label: "Anular cobro", variant: "danger", size: "sm" }}
              title="Anular cobro pendiente"
              message="Se anula el cobro y el link deja de servir. Podrás reagendar de nuevo."
              cta="Anular cobro"
              success="Cobro anulado."
            />
          </div>
        </Card>
      );
    }
    case "refund":
      return (
        <Card title="Reagendamiento pendiente">
          <p className="text-sm leading-relaxed text-bone-dim">
            Reembolso de reagendamiento pendiente · {formatCLP(pending.deltaClp)}. La sesión ya se movió a{" "}
            {formatSessionWhen(pending.newStartsAt, tz, { endsAt: pending.newEndsAt })}; Mercado Pago aún no
            devolvió la diferencia.
          </p>
          {pending.offlineSettledClp > 0 && (
            // Pedido mixto (original offline + delta por MP): la parte en mano ya está asentada;
            // lo que falta es solo la parte de MP — que no se devuelva el total dos veces.
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              Ya registraste {formatCLP(pending.offlineSettledClp)} devueltos en efectivo/transferencia; faltan{" "}
              {formatCLP(pending.deltaClp - pending.settledClp)} por Mercado Pago.
            </p>
          )}
          <p className="mt-2 label-sm text-bone-quiet">
            Cancelar y reagendar quedan deshabilitados hasta que el reembolso se resuelva.
          </p>
          <div className="mt-4">
            <ActionForm action={retryRescheduleRefundAction}>
              <input type="hidden" name="reservationId" value={reservationId} />
              <input type="hidden" name="rescheduleId" value={pending.id} />
              <SubmitButton size="sm" pendingLabel="Reintentando…">
                Reintentar reembolso
              </SubmitButton>
            </ActionForm>
          </div>
        </Card>
      );
    default:
      return null;
  }
}
