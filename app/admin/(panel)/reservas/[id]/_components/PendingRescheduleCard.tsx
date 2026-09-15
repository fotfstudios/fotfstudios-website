"use client";

import { cancelRescheduleChargeAction } from "../actions";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { formatSessionWhen } from "@/src/application/notifications/format-when";
import type { AdminBookingDetail } from "@/src/infrastructure/db/admin-repository";
import { formatCLP } from "@/src/domain/money/money";

type Pending = AdminBookingDetail["reschedules"][number];

/**
 * Reagendamiento pendiente (H3/H5): a lo más UNA fila `pending_charge`/`pending_refund`
 * por reserva (índice único de la migración) — mientras exista, la sesión sigue en su
 * horario ORIGINAL y no se puede reagendar de nuevo. "Anular cobro" cierra la orden
 * delta y libera la reserva para un nuevo intento; el reagendamiento vuelve a
 * habilitarse solo cuando esta fila deja de estar pendiente.
 *
 * `kind` decide el copy: hoy solo existe `charge` (cobro por un horario más caro). El
 * reembolso diferido (`pending_refund`, PR2) llega con su propia rama — por ahora cae
 * al fallback y no debería ocurrir en datos reales.
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
    default:
      return null;
  }
}
