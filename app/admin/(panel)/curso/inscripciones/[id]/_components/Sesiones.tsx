import { DateTime } from "luxon";
import { fmtDay, fmtTimeRange } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { hhmm } from "@/components/booking/format";
import { halfHourStarts } from "@/lib/course-admin";
import type { CourseSessionRow } from "@/src/application/ports/course";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import { cancelSessionAction, markSessionDictadaAction, scheduleProgramAction } from "../../../actions";
import { EditarSesionDialog } from "./EditarSesionDialog";

/**
 * Las sesiones del programa. Sin sesiones → se agenda la grilla completa (6 × 90
 * min, todo o nada). Con sesiones → cada una se mueve, se marca dictada o se
 * cancela por separado; una cancelada se puede re-agendar.
 */
export function Sesiones({
  enrollmentId,
  sessions,
  practiceValidUntil,
  canSchedule,
  tz,
}: {
  enrollmentId: string;
  sessions: CourseSessionRow[];
  practiceValidUntil: string | null;
  /** El programa sigue vivo (alguien reservado o pagado). */
  canSchedule: boolean;
  tz: string;
}) {
  const starts = halfHourStarts();
  const sinAgendar = sessions.every((s) => s.status === "cancelada");

  return (
    <Card title="Sesiones">
      {sinAgendar ? (
        canSchedule ? (
          <ActionForm
            action={scheduleProgramAction}
            success="Sesiones agendadas."
            className="grid gap-4 sm:grid-cols-[1fr_8rem_12rem_auto] sm:items-end"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <Field label="Primera sesión">
              <Input type="date" name="firstDate" required />
            </Field>
            <Field label="Hora">
              <Select name="startMinute" defaultValue={19 * 60}>
                {starts.map((m) => (
                  <option key={m} value={m}>
                    {hhmm(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Frecuencia">
              <Select name="everyWeeks" defaultValue="1">
                <option value="1">Una por semana</option>
                <option value="2">Cada dos semanas</option>
              </Select>
            </Field>
            <div className="pb-1">
              <SubmitButton size="sm" pendingLabel="Agendando…">
                Agendar las {COURSE_PROGRAM.sessions}
              </SubmitButton>
            </div>
            <p className="label-sm text-bone-quiet sm:col-span-4">
              {COURSE_PROGRAM.sessions} sesiones de {(COURSE_PROGRAM.sessionMinutes / 60).toLocaleString("es-CL")} h.
              Si alguna choca con una reserva, no se agenda ninguna y te decimos cuál.
            </p>
          </ActionForm>
        ) : (
          <p className="label-sm text-bone-quiet">Sin sesiones agendadas.</p>
        )
      ) : (
        <ul className="flex flex-col">
          {sessions.map((s) => {
            const local = s.startsAt ? DateTime.fromISO(s.startsAt).setZone(tz) : null;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-3 first:border-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-bone">
                    <span className="mr-2 font-mono text-bone-quiet">{s.n}</span>
                    {s.title}
                  </p>
                  <p className="label-sm mt-1 text-bone-quiet">
                    {s.status === "cancelada" || !s.startsAt || !s.endsAt
                      ? "Sin fecha"
                      : `${local!.setLocale("es").toFormat("ccc d LLL")} · ${fmtTimeRange(s.startsAt, s.endsAt, tz)}`}
                    {s.instructor ? ` · ${s.instructor}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={s.status} />
                  {s.status !== "dictada" && canSchedule && (
                    <EditarSesionDialog
                      enrollmentId={enrollmentId}
                      starts={starts}
                      session={{
                        id: s.id,
                        n: s.n,
                        title: s.title,
                        status: s.status,
                        instructor: s.instructor,
                        date: s.status === "agendada" && local ? local.toISODate() : null,
                        startMinute: s.status === "agendada" && local ? local.hour * 60 + local.minute : null,
                      }}
                    />
                  )}
                  {s.status === "agendada" && (
                    <>
                      <ConfirmForm
                        action={markSessionDictadaAction}
                        hidden={{ sessionId: s.id, enrollmentId }}
                        trigger={{ label: "Dictada", variant: "ghost", size: "sm" }}
                        title={`Sesión ${s.n} dictada`}
                        message="Queda registrada como dictada. El bloque sigue en la agenda: la hora ya se usó."
                        cta="Marcar dictada"
                        confirm="primary"
                        success="Sesión marcada como dictada."
                      />
                      <ConfirmForm
                        action={cancelSessionAction}
                        hidden={{ sessionId: s.id, enrollmentId }}
                        trigger={{ label: "Cancelar", variant: "ghost", size: "sm" }}
                        title={`Cancelar la sesión ${s.n}`}
                        message="Libera la sala. Para cambiar la fecha usa Editar; una sesión cancelada se puede re-agendar después."
                        cta="Cancelar sesión"
                        success="Sesión cancelada."
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {practiceValidUntil && (
        <p className="label-sm mt-4 border-t hairline pt-4 text-bone-quiet">
          La práctica libre vence el {fmtDay(practiceValidUntil)}.
        </p>
      )}
    </Card>
  );
}
