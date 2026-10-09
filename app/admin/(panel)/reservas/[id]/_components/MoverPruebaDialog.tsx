"use client";

import { useCallback } from "react";
import { MoveSlotDialog } from "@/components/admin/MoveSlotDialog";
import { getRescheduleDayAction, moveTrialAction } from "../actions";

/**
 * Mover la prueba del curso: solo día y hora (dura siempre 1 h y el precio no cambia, así
 * que no hay cotización ni delta como en "Reagendar"). Elegir → revisar → confirmar.
 */
export function MoverPruebaDialog({
  reservationId,
  tz,
  startsAt,
  endsAt,
  customerName,
  customerEmail,
}: {
  reservationId: string;
  tz: string;
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  customerEmail: string | null;
}) {
  const loadDay = useCallback((d: string) => getRescheduleDayAction(reservationId, d), [reservationId]);
  return (
    <MoveSlotDialog
      trigger="Mover prueba"
      title="Mover la prueba del curso"
      action={moveTrialAction}
      success="Prueba movida. Le avisamos al cliente."
      hidden={{ reservationId }}
      tz={tz}
      startsAt={startsAt}
      endsAt={endsAt}
      loadDay={loadDay}
      ignoreId={reservationId}
      who={{ label: "Cliente", value: customerName ?? "Sin nombre" }}
      rows={[
        { label: "Cobro", value: "Sin cobro ni reembolso · 1 hora" },
        {
          label: "Avisos",
          value: customerEmail
            ? `Correo a ${customerEmail} con el nuevo horario, y a ti.`
            : "El cliente no tiene email: avísale tú. A ti te llega el correo.",
        },
      ]}
      pickerNote="Sigue durando 1 hora y el precio no cambia."
    />
  );
}
