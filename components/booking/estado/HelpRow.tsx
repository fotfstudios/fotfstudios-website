import WhatsAppCta from "@/components/WhatsAppCta";
import { SITE } from "@/lib/site";

const WA = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);
const MAIL = (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

/** "¿Algo no cuadra?": WhatsApp (mide whatsapp_click), correo y, con cuentas, gestionar la reserva. */
export default function HelpRow({
  source,
  waMessage,
  manageHref,
}: {
  source: string;
  waMessage?: string;
  manageHref: string | null;
}) {
  const link = "flex min-h-11 items-center gap-2 text-sm transition-colors";
  const phone = `+${SITE.whatsapp.slice(0, 2)} ${SITE.whatsapp.slice(2, 3)} ${SITE.whatsapp.slice(3, 7)} ${SITE.whatsapp.slice(7)}`;
  return (
    <section aria-labelledby="estado-help" className="ds-no-print flex flex-col gap-2 rounded-[10px] border border-[var(--border-subtle)] px-5 py-4">
      <h2 id="estado-help" className="ds-eyebrow text-[var(--text-muted)]">
        ¿Algo no cuadra?
      </h2>
      <div className="flex flex-wrap items-center gap-x-5">
        <WhatsAppCta source={source} waMessage={waMessage} className={`${link} text-[var(--accent)] hover:text-[var(--accent-hover)]`}>
          {WA}WhatsApp {phone}
        </WhatsAppCta>
        <a href="mailto:pagos@fotfstudios.cl" className={`${link} text-[var(--accent)] hover:text-[var(--accent-hover)]`}>
          {MAIL}pagos@fotfstudios.cl
        </a>
        {manageHref && (
          <a href={manageHref} className={`${link} text-[var(--text-muted)] hover:text-[var(--text-primary)]`}>
            Reagendar o cancelar →
          </a>
        )}
      </div>
    </section>
  );
}
