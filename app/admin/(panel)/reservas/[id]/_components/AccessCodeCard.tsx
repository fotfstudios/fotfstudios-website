import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { Input } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { fmtDateTime } from "@/components/admin/format";
import {
  markAccessAction,
  regenerateAccessCodeAction,
} from "../actions";
import { markAccessLoadedAction, markAccessRemovedAction } from "../../../cerradura/actions";

export interface AccessCodeCardProps {
  reservationId: string;
  status: string;
  /** Fin de la sesión (ISO). Después de esto el PIN pasa a "quitar". */
  endsAt: string;
  customerEmail: string | null;
  accessCode: string | null;
  accessLoadedAt: string | null;
  accessSentAt: string | null;
  accessRemovedAt: string | null;
}

/** En qué paso del ciclo está el PIN. Se deriva de las marcas, nunca se guarda aparte. */
function step(p: AccessCodeCardProps): "none" | "generated" | "loaded" | "sent" | "to_remove" | "removed" {
  if (!p.accessCode) return "none";
  if (p.accessRemovedAt) return "removed";
  if (Date.parse(p.endsAt) < Date.now()) return "to_remove";
  if (p.accessSentAt) return "sent";
  if (p.accessLoadedAt) return "loaded";
  return "generated";
}

/**
 * El PIN de la cerradura, paso a paso. La app genera, el dueño lo carga en la
 * Yale a mano y lo marca, el cron lo manda 10 minutos antes, y al terminar la
 * sesión hay que sacarlo. La app no habla con Yale: cada marca es la palabra del
 * dueño, y los botones lo dicen con todas las letras.
 */
export function AccessCodeCard(p: AccessCodeCardProps) {
  const s = step(p);
  const confirmed = p.status === "confirmed";

  return (
    <Card title="Acceso">
      {s === "none" && (
        <>
          <p className="label-sm text-bone-mute">
            {confirmed
              ? "El PIN se genera solo en minutos. Si lo necesitas ya, genera uno ahora."
              : "El PIN se genera cuando la reserva quede confirmada."}
          </p>
          {confirmed && (
            <ActionForm action={regenerateAccessCodeAction} success="PIN generado." className="mt-3">
              <input type="hidden" name="reservationId" value={p.reservationId} />
              <SubmitButton size="sm" pendingLabel="Generando…">
                Generar ahora
              </SubmitButton>
            </ActionForm>
          )}
        </>
      )}

      {s !== "none" && (
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl tracking-[0.2em] text-bone">{p.accessCode}</span>
          <CopyButton value={p.accessCode ?? ""} label="Copiar PIN" />
        </div>
      )}

      {s === "generated" && (
        <>
          <p className="mt-3 label-sm text-bone-dim">
            Cárgalo en la app de Yale y confírmalo acá. Hasta que no lo marques, <strong>no se envía</strong>.
          </p>
          <ActionForm action={markAccessLoadedAction} success="PIN marcado como cargado." className="mt-3">
            <input type="hidden" name="reservationId" value={p.reservationId} />
            <SubmitButton size="sm" pendingLabel="Guardando…">
              Ya está cargado en la cerradura
            </SubmitButton>
          </ActionForm>
        </>
      )}

      {s === "loaded" && (
        <p className="mt-3 label-sm text-bone-dim">
          Cargado {p.accessLoadedAt ? fmtDateTime(p.accessLoadedAt) : ""}.{" "}
          {p.customerEmail
            ? "Se envía por email 10 minutos antes de la sesión."
            : "Sin email en la reserva: compártelo por WhatsApp."}
        </p>
      )}

      {s === "sent" && (
        <p className="mt-3 label-sm text-bone-mute">Enviado {p.accessSentAt ? fmtDateTime(p.accessSentAt) : ""}.</p>
      )}

      {s === "to_remove" && (
        <>
          <p className="mt-3 label-sm text-sirena">
            La sesión terminó y el PIN sigue en la cerradura. Bórralo en la app de Yale y confírmalo acá.
          </p>
          <ActionForm action={markAccessRemovedAction} success="PIN marcado como quitado." className="mt-3">
            <input type="hidden" name="reservationId" value={p.reservationId} />
            <SubmitButton size="sm" variant="secondary" pendingLabel="Guardando…">
              Ya lo quité de la cerradura
            </SubmitButton>
          </ActionForm>
        </>
      )}

      {s === "removed" && (
        <p className="mt-3 label-sm text-bone-mute">Quitado {p.accessRemovedAt ? fmtDateTime(p.accessRemovedAt) : ""}.</p>
      )}

      {/* Corrección manual: otro PIN (generado o tipeado). Reinicia el ciclo. */}
      {(s === "generated" || s === "loaded") && (
        <details className="mt-4">
          <summary className="cursor-pointer label-sm text-bone-mute">Cambiar el PIN</summary>
          <div className="mt-3 flex flex-col gap-3">
            <ActionForm action={regenerateAccessCodeAction} success="PIN nuevo generado. Vuelve a cargarlo.">
              <input type="hidden" name="reservationId" value={p.reservationId} />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Generando…">
                Generar otro
              </SubmitButton>
            </ActionForm>
            <ActionForm action={markAccessAction} success="PIN guardado. Vuelve a cargarlo." className="flex items-end gap-2">
              <input type="hidden" name="reservationId" value={p.reservationId} />
              <Input name="code" inputMode="numeric" placeholder="O escribe uno" maxLength={10} className="font-mono" />
              <SubmitButton size="sm" variant="secondary">
                Usar este
              </SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}
