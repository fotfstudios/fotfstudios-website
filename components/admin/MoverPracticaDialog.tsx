"use client";

import type { ActionDataResult, ActionResult } from "@/components/admin/ui/action";
import type { DayConsoleData } from "@/components/admin/day-occupancy";
import { MoveSlotDialog } from "./MoveSlotDialog";

/**
 * Mover una hora de práctica libre del curso: solo día y hora, misma duración y mismo saldo.
 * Vive acá (y no en un segmento) porque la usan la ficha del alumno y la de la reserva; las
 * server actions llegan por props desde cada página.
 */
export function MoverPracticaDialog({
  action,
  loadDay,
  reservationId,
  tz,
  startsAt,
  endsAt,
  studentName,
  studentEmail,
  accessLoaded,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  /** Ocupación del día; el selector descuenta la propia práctica con `ignoreId`. */
  loadDay: (date: string) => Promise<ActionDataResult<DayConsoleData>>;
  reservationId: string;
  tz: string;
  startsAt: string;
  endsAt: string;
  studentName: string | null;
  studentEmail: string | null;
  /** PIN cargado en la cerradura (y no quitado): el resumen dice si hay que tocarla. */
  accessLoaded: boolean;
}) {
  const hours = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000);
  const duration = `${hours} ${hours === 1 ? "hora" : "horas"}`;
  return (
    <MoveSlotDialog
      trigger="Mover"
      title="Mover la práctica libre"
      action={action}
      success="Práctica movida. Le avisamos al alumno."
      hidden={{ reservationId }}
      tz={tz}
      startsAt={startsAt}
      endsAt={endsAt}
      loadDay={loadDay}
      ignoreId={reservationId}
      who={{ label: "Alumno", value: studentName ?? "Sin nombre" }}
      rows={[
        { label: "Saldo", value: `${duration} · el saldo de horas no cambia` },
        {
          label: "PIN",
          value: accessLoaded
            ? "Sigue cargado en la cerradura: no hay que tocarla. Se le vuelve a mandar antes del nuevo horario."
            : "Todavía sin cargar: cárgalo antes del nuevo horario.",
        },
        {
          label: "Avisos",
          value: studentEmail
            ? `Correo a ${studentEmail} con el nuevo horario, y a ti.`
            : "El alumno no tiene email: avísale tú. A ti te llega el correo.",
        },
      ]}
      pickerNote={`Sigue durando ${duration}. Para cambiar la duración, cancela y agenda de nuevo.`}
    />
  );
}
