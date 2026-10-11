import { SITE } from "@/lib/site";

/**
 * "Qué sigue" tras confirmar: correo ahora, recordatorio 24 h antes, código de acceso 10
 * minutos antes y el lugar. La promesa del acceso es POR EMAIL (WhatsApp es aditivo, solo
 * si lo activó): lib/notifications-copy-contract.test.ts fija esta frase.
 */
export default function NextSteps({ startShort }: { startShort: string | null }) {
  const row = (when: string, children: React.ReactNode) => (
    <>
      <span className="ds-mono pt-0.5 text-xs text-[var(--accent)]">{when}</span>
      <span>{children}</span>
    </>
  );
  return (
    <section aria-labelledby="estado-next" className="flex flex-col gap-3.5">
      <h2 id="estado-next" className="ds-eyebrow text-[var(--text-muted)]">
        Qué sigue
      </h2>
      <div className="grid grid-cols-[72px_1fr] gap-x-3.5 gap-y-2.5 text-sm text-[var(--text-secondary)]">
        {row("Ahora", "Te enviamos un email con el detalle y este comprobante. Si no llega en 5 minutos, revisa spam o escríbenos.")}
        {row("−24 h", "Recordatorio por email (y por WhatsApp si lo activaste).")}
        {row(
          "−10 min",
          <>
            <strong className="font-medium text-[var(--text-primary)]">
              Tu código de acceso te llega por email (y por WhatsApp si lo activaste) 10 minutos antes
            </strong>{" "}
            de tu sesión. Entras solo, sin esperar a nadie.
          </>,
        )}
        {row(
          startShort ?? "Tu sesión",
          <>
            {SITE.address}. Trae audífonos y tu USB.{" "}
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-no-print text-[var(--accent)] underline-offset-4 hover:underline"
            >
              Ver en Google Maps →
            </a>
          </>,
        )}
      </div>
    </section>
  );
}
