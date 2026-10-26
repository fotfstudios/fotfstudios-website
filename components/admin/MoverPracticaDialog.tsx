"use client";

import type { ActionDataResult, ActionResult } from "@/components/admin/ui/action";
import type { DayConsoleData } from "@/components/admin/day-occupancy";
import { practiceDurations, practiceHoursLabel } from "@/src/domain/course/practice";
import { MoveSlotDialog } from "./MoveSlotDialog";

/**
 * Mover una hora de práctica libre del curso: día, hora y duración (medias horas, mínimo 1 h).
 * Alargarla descuenta la diferencia del saldo y acortarla la devuelve; hasta la duración
 * actual + lo que le queda (`libres`).
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
  libres,
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
  /** Horas de práctica que le quedan sin agendar (el tope para alargarla). */
  libres: number;
}) {
  const hours = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 1_800_000) / 2;
  const durations = practiceDurations(hours + libres).map((h) => ({ hours: h, label: practiceHoursLabel(h) }));
  const saldo = (min: number) => {
    const delta = min / 60 - hours;
    const left = libres - delta;
    if (delta === 0) return `${practiceHoursLabel(hours)} · el saldo de horas no cambia`;
    return `${delta > 0 ? "Descuenta" : "Devuelve"} ${practiceHoursLabel(Math.abs(delta))} · le ${left === 1 ? "queda" : "quedan"} ${practiceHoursLabel(left)}`;
  };
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
      durations={durations}
      rows={(min) => [
        { label: "Saldo", value: saldo(min) },
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
      pickerNote={`Hoy dura ${practiceHoursLabel(hours)}; le quedan ${practiceHoursLabel(libres)} sin agendar. Alargarla descuenta la diferencia del saldo y acortarla la devuelve.`}
    />
  );
}
