"use client";

import { cancelRescheduleChargeAction, retryRescheduleRefundAction } from "../actions";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
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
}: {
  reservationId: string;
  pending: Pending;
  tz: string;
}) {
  switch (pending.kind) {
    case "charge":
      return (
        <Card title="Reagendamiento pendiente">
          <p className="text-sm leading-relaxed text-bone-dim">
            Cobro de {formatCLP(pending.deltaClp)} por mover a{" "}
            {formatSessionWhen(pending.newStartsAt, tz, { endsAt: pending.newEndsAt })}. La reserva se mueve
            cuando el cliente pague.
          </p>
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
    case "refund":
      return (
        <Card title="Reagendamiento pendiente">
          <p className="text-sm leading-relaxed text-bone-dim">
            Reembolso de reagendamiento pendiente · {formatCLP(pending.deltaClp)}. La sesión ya se movió a{" "}
            {formatSessionWhen(pending.newStartsAt, tz, { endsAt: pending.newEndsAt })}; Mercado Pago aún no
            devolvió la diferencia.
          </p>
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
