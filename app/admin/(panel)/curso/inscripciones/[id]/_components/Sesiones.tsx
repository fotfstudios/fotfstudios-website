import { DateTime } from "luxon";
import { fmtDay, fmtTimeRange } from "@/components/admin/format";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { Field, Select } from "@/components/admin/ui/Field";
import { StatusPill } from "@/components/admin/ui/StatusPill";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { SESIONES } from "@/lib/curso-content";
import type { CourseSessionRow } from "@/src/application/ports/course";
import { COURSE_PROGRAM } from "@/src/domain/course/program";
import {
  cancelSessionAction,
  courseDayAction,
  markSessionDictadaAction,
  scheduleProgramAction,
} from "../../../actions";
import { AgendarSesionDialog } from "./AgendarSesionDialog";
import { EditarSesionDialog } from "./EditarSesionDialog";

/**
 * Las sesiones del programa, una por fila, SIEMPRE las 6. Un alumno 1:1 acuerda
 * cada sesión cuando puede: las que no tienen fecha quedan "Por agendar" y no
 * bloquean la sala; cada una se agenda sola con su propio día y hora. Las agendadas
 * se editan, se marcan dictadas o se cancelan; una cancelada se re-agenda.
 * "Agendar las 6 de una vez" queda como atajo para quien sí quiere un horario fijo.
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
  const byN = new Map(sessions.map((s) => [s.n, s]));
  const total = Math.max(COURSE_PROGRAM.sessions, ...sessions.map((s) => s.n));
  const rows = Array.from({ length: total }, (_, i) => i + 1);
  const ninguna = sessions.every((s) => s.status === "cancelada");
  const porAgendar = rows.filter((n) => !byN.has(n) || byN.get(n)!.status === "cancelada").length;

  return (
    <Card
      title="Sesiones"
      action={
        <span className="label-sm text-bone-quiet">
          {porAgendar === 0 ? "Todas agendadas" : `${porAgendar} por agendar`}
        </span>
      }
    >
      <ul className="flex flex-col">
        {rows.map((n) => {
          const s = byN.get(n);
          const title = s?.title ?? SESIONES[n - 1]?.title ?? `Sesión ${n}`;
          const local = s?.startsAt ? DateTime.fromISO(s.startsAt).setZone(tz) : null;
          const conFecha = s && s.status !== "cancelada" && s.startsAt && s.endsAt;
          return (
            <li
              key={n}
              className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-3 first:border-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-bone">
                  <span className="mr-2 font-mono text-bone-quiet">{n}</span>
                  {title}
                </p>
                <p className="label-sm mt-1 text-bone-quiet">
                  {conFecha
                    ? `${local!.setLocale("es").toFormat("ccc d LLL")} · ${fmtTimeRange(s.startsAt!, s.endsAt!, tz)}`
                    : "Sin fecha"}
                  {s?.instructor ? ` · ${s.instructor}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!s ? (
                  <>
                    <span className="label-sm text-bone-quiet">Por agendar</span>
                    {canSchedule && <AgendarSesionDialog enrollmentId={enrollmentId} n={n} title={title} tz={tz} />}
                  </>
                ) : (
                  <>
                    <StatusPill status={s.status} />
                    {s.status !== "dictada" && canSchedule && (
                      <EditarSesionDialog
                        enrollmentId={enrollmentId}
                        tz={tz}
                        session={{
                          id: s.id,
                          n: s.n,
                          title: s.title,
                          status: s.status,
                          reservationId: s.reservationId,
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
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {ninguna && canSchedule && (
        <details className="mt-5 border-t hairline pt-4">
          <summary className="label-sm cursor-pointer text-bone-quiet hover:text-gold">
            Agendar las {COURSE_PROGRAM.sessions} de una vez (mismo día y hora)
          </summary>
          <ActionForm
            action={scheduleProgramAction}
            success="Sesiones agendadas."
            className="mt-4 flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <SlotPicker
              loadDay={courseDayAction}
              durationMin={COURSE_PROGRAM.sessionMinutes}
              tz={tz}
              dateLabel="Primera sesión"
              dateName="firstDate"
            />
            <Field label="Frecuencia">
              <Select name="everyWeeks" defaultValue="1">
                <option value="1">Una por semana</option>
                <option value="2">Cada dos semanas</option>
              </Select>
            </Field>
            <p className="label-sm text-bone-quiet">
              Las horas libres son las del primer día. Si alguna de las semanas siguientes choca con una
              reserva, no se agenda ninguna y te decimos cuál.
            </p>
            <div>
              <SubmitButton size="sm" variant="secondary" pendingLabel="Agendando…">
                Agendar las {COURSE_PROGRAM.sessions}
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}

      {practiceValidUntil && (
        <p className="label-sm mt-4 border-t hairline pt-4 text-bone-quiet">
          La práctica libre vence el {fmtDay(practiceValidUntil)}.
        </p>
      )}
    </Card>
  );
}
