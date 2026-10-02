import { processNowAction, retryFailedAction, sendTestAction } from "./actions";
import { FailuresTable } from "./_components/FailuresTable";
import { maskPhone } from "./labels";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Card } from "@/components/admin/ui/Card";
import { EmptyState } from "@/components/admin/ui/EmptyState";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Stat } from "@/components/admin/ui/Stat";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { whatsappConfig, whatsappOutboxRepository } from "@/src/composition";
import type { WhatsAppOutboxFailure, WhatsAppOutboxStats } from "@/src/infrastructure/db/whatsapp-outbox-repository";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp — Admin", robots: { index: false } };

/**
 * Avisos por WhatsApp vía Kapso: si está configurado, a dónde van las alertas del dueño, los
 * números de las últimas 24 h y lo que falló. "Enviar prueba" es el primer envío real tras el alta
 * (el sandbox de Kapso no manda plantillas).
 */
export default async function WhatsappPage() {
  await requirePermission("whatsapp.manage");
  const config = whatsappConfig();
  const repo = whatsappOutboxRepository();
  // La cola puede no existir todavía (base atrasada respecto de la migración): la página igual
  // explica la configuración en vez de tirar el panel entero.
  let queue: { stats: WhatsAppOutboxStats; failures: WhatsAppOutboxFailure[] } | null = null;
  try {
    const [stats, failures] = await Promise.all([repo.stats(24), repo.recentFailures(50)]);
    queue = { stats, failures };
  } catch (e) {
    console.error("[admin:whatsapp]", e);
  }

  return (
    <>
      <PageHeader kicker="Configuración" title="WhatsApp" />

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-bone-dim">
        Confirmación, recordatorio, código de acceso y pagos pendientes llegan también por WhatsApp a los clientes que lo
        aceptaron, y las alertas de reservas y contactos nuevos al celular del dueño. El correo sale siempre; WhatsApp es un
        canal adicional. Los mensajes salen desde la línea del estudio (coexistencia con la app WhatsApp Business).
      </p>

      <Card title="Conexión" className="mt-8">
        <dl className="grid gap-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="label text-bone-quiet">Estado</dt>
          <dd className={config.configured ? "text-gold" : "text-bone"}>
            {config.configured ? (config.production ? "Configurado" : "Configurado · solo al dueño (fuera de producción)") : "Sin configurar"}
          </dd>

          <dt className="label text-bone-quiet">Número de Kapso</dt>
          <dd className="break-all font-mono text-xs text-bone">
            {config.phoneNumberId ?? <span className="text-sm text-bone-quiet">Falta KAPSO_PHONE_NUMBER_ID</span>}
          </dd>

          <dt className="label text-bone-quiet">Alertas del dueño</dt>
          <dd className="font-mono text-xs text-bone">
            {config.ownerWhatsapp ? (
              maskPhone(config.ownerWhatsapp)
            ) : (
              <span className="text-sm text-bone-quiet">
                {config.ownerInvalid ? "OWNER_WHATSAPP no es válido o es la línea del estudio" : "Falta OWNER_WHATSAPP"}
              </span>
            )}
          </dd>

          <dt className="label text-bone-quiet">Webhook de estado</dt>
          <dd className="text-bone">
            {config.webhookSecretSet ? (
              <span className="font-mono text-xs">/api/webhooks/kapso</span>
            ) : (
              <span className="text-sm text-bone-quiet">Falta KAPSO_WEBHOOK_SECRET (no se sabrá si los mensajes llegaron)</span>
            )}
          </dd>
        </dl>

        {!config.configured && (
          <ol className="mt-6 list-decimal space-y-1.5 border-t hairline pt-5 pl-5 text-sm text-bone-dim">
            <li>En Kapso: crear el proyecto y conectar la línea del estudio en modo coexistencia (QR desde la app WhatsApp Business).</li>
            <li>Crear las plantillas de docs/whatsapp-templates.md y esperar que Meta las apruebe.</li>
            <li>En Kapso → Webhooks: URL https://www.fotfstudios.cl/api/webhooks/kapso, eventos sent/delivered/read/failed y el secreto.</li>
            <li>En Vercel: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID, KAPSO_WEBHOOK_SECRET y OWNER_WHATSAPP. Redeploy. Detalle en DEPLOY.md.</li>
          </ol>
        )}

        {config.configured && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t hairline pt-5">
            {config.ownerWhatsapp ? (
              <ActionForm action={sendTestAction} success="Prueba enviada. Revisa el WhatsApp del dueño.">
                <SubmitButton size="sm" pendingLabel="Enviando…">
                  Enviar prueba al dueño
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-bone-quiet">Configura OWNER_WHATSAPP para mandar una prueba.</p>
            )}
          </div>
        )}
      </Card>

      {queue === null ? (
        <div className="mt-8">
          <EmptyState icon="alert" title="Cola no disponible" hint="La migración whatsapp_outbox todavía no está aplicada en esta base." />
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="En cola" value={String(queue.stats.pending)} />
            <Stat label="Enviados · 24 h" value={String(queue.stats.sent)} />
            <Stat label="Entregados · 24 h" value={String(queue.stats.delivered)} />
            <Stat label="Fallidos · 24 h" value={String(queue.stats.failed)} accent={queue.stats.failed > 0} />
          </div>

          {config.configured && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ActionForm action={processNowAction} success="Cola procesada.">
                <SubmitButton size="sm" variant="ghost" pendingLabel="Procesando…">
                  Procesar ahora
                </SubmitButton>
              </ActionForm>
              {queue.failures.length > 0 && (
                <ActionForm action={retryFailedAction} success="Fallidos de vuelta en la cola.">
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Reintentando…">
                    Reintentar fallidos
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          )}

          <div className="mt-8">
            {queue.failures.length === 0 ? (
              <EmptyState
                icon="check"
                title="Sin fallos"
                hint="Si Kapso o Meta rechazan un aviso, aparece acá con el código y el motivo. Los errores pasajeros se reintentan solos."
                size="compact"
              />
            ) : (
              <FailuresTable rows={queue.failures} />
            )}
          </div>
        </>
      )}
    </>
  );
}
