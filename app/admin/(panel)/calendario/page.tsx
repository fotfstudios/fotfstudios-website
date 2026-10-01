import { resyncAllAction, syncNowAction } from "./actions";
import { FailuresTable } from "./_components/FailuresTable";
import { DateTime } from "luxon";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import type { SyncFailure, SyncStats } from "@/src/application/ports/calendar";
import { calendarSyncConfig, calendarSyncRepository } from "@/src/composition";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";

/** Valor corto para el Stat (la cifra va en tipografía display): la hora si fue hoy, si no el día. */
function lastSynced(iso: string | null): string {
  if (!iso) return "—";
  const t = DateTime.fromISO(iso).setZone("America/Santiago").setLocale("es");
  return t.hasSame(DateTime.now().setZone("America/Santiago"), "day") ? t.toFormat("HH:mm") : t.toFormat("d LLL");
}
export const metadata = { title: "Google Calendar — Admin", robots: { index: false } };

/**
 * Espejo de la agenda en Google Calendar (unidireccional). Muestra si está configurado, el
 * email de la cuenta de servicio SIN enmascarar (el dueño lo copia para compartir el
 * calendario), y la cola: pendientes, errores y la última sincronización.
 */
export default async function CalendarioPage() {
  await requirePermission("calendar.manage");
  const config = calendarSyncConfig();
  const repo = calendarSyncRepository();
  // La cola puede no existir todavía (staging atrasado respecto de la migración): la página
  // igual explica la configuración en vez de tirar el panel entero.
  let queue: { stats: SyncStats; failures: SyncFailure[] } | null = null;
  try {
    const [stats, failures] = await Promise.all([repo.stats(), repo.failures(50)]);
    queue = { stats, failures };
  } catch (e) {
    console.error("[admin:calendario]", e);
  }

  return (
    <>
      <PageHeader kicker="Configuración" title="Google Calendar" />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-dim">
        Cada reserva, sesión de curso y bloqueo aparece en un calendario de Google, se mueve al reagendar y desaparece al
        cancelar. Es de una sola vía: lo que se edite a mano en Google se pisa en el próximo cambio. Nunca sale el teléfono ni
        el email del cliente.
      </p>

      <Card title="Conexión" className="mt-8">
        <dl className="grid gap-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="label text-bone-quiet">Estado</dt>
          <dd className={config.configured ? "text-gold" : "text-bone"}>
            {config.configured ? "Configurado" : "Sin configurar"}
          </dd>

          <dt className="label text-bone-quiet">Cuenta de servicio</dt>
          <dd className="flex items-center gap-3 break-all">
            {config.serviceAccountEmail ? (
              <>
                <span className="font-mono text-xs text-bone">{config.serviceAccountEmail}</span>
                <CopyButton value={config.serviceAccountEmail} label="Email copiado" />
              </>
            ) : (
              <span className="text-bone-quiet">{config.error ?? "Falta GOOGLE_SERVICE_ACCOUNT_JSON"}</span>
            )}
          </dd>

          <dt className="label text-bone-quiet">Calendario</dt>
          <dd className="break-all font-mono text-xs text-bone">
            {config.calendarId ?? <span className="text-sm text-bone-quiet">Falta GOOGLE_CALENDAR_ID</span>}
          </dd>
        </dl>

        {!config.configured && (
          <ol className="mt-6 list-decimal space-y-1.5 border-t hairline pt-5 pl-5 text-sm text-bone-dim">
            <li>En Google Cloud: crear un proyecto, habilitar Google Calendar API y crear una cuenta de servicio con una llave JSON.</li>
            <li>En Vercel: GOOGLE_SERVICE_ACCOUNT_JSON (la llave, idealmente en base64) y GOOGLE_CALENDAR_ID. Redeploy.</li>
            <li>En Google Calendar: crear un calendario dedicado y compartirlo con el email de la cuenta de servicio con «Hacer cambios en eventos».</li>
            <li>Volver acá y apretar «Resincronizar todo». Detalle en DEPLOY.md.</li>
          </ol>
        )}
      </Card>

      {queue === null ? (
        <div className="mt-8">
          <EmptyState icon="alert" title="Cola no disponible" hint="La migración calendar_sync todavía no está aplicada en esta base." />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Pendientes" value={String(queue.stats.pending)} />
            <Stat label="Con error" value={String(queue.stats.failing)} accent={queue.stats.failing > 0} />
            <Stat label="Última sincronización" value={lastSynced(queue.stats.lastSyncedAt)} />
          </div>

          {config.configured && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ActionForm action={syncNowAction} success="Sincronizado.">
                <SubmitButton size="sm" pendingLabel="Sincronizando…">Sincronizar ahora</SubmitButton>
              </ActionForm>
              <ConfirmForm
                action={resyncAllAction}
                trigger={{ label: "Resincronizar todo", variant: "ghost", size: "sm" }}
                title="Resincronizar todo"
                message="Vuelve a mandar a Google todas las reservas vigentes, aunque no hayan cambiado. Sirve si se borraron eventos a mano. No limpia un calendario usado antes con otro GOOGLE_CALENDAR_ID."
                cta="Resincronizar"
                confirm="primary"
                success="Resincronización en marcha."
              />
            </div>
          )}

          <div className="mt-8">
            {queue.failures.length === 0 ? (
              <EmptyState icon="check" title="Sin errores" hint="Si Google rechaza un evento, aparece acá con el motivo y se reintenta solo." size="compact" />
            ) : (
              <FailuresTable rows={queue.failures} />
            )}
          </div>
        </>
      )}
    </>
  );
}
