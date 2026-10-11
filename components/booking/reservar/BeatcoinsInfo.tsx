import { formatCLP } from "@/src/domain/money/money";
import { EARN_RATE } from "@/src/domain/points/points";

/** Ancla de la sección de Beatcoins en los términos (ProseSection id="beatcoins"). */
export const BEATCOINS_TERMS_HREF = "/terminos#beatcoins";

/**
 * Qué son los Beatcoins (el programa de recompensas de FOTF Studios: un cashback en
 * Beatcoins) + lo que suma esta reserva, con enlace a sus condiciones (en otra pestaña: no
 * se pierde el checkout). Lo usan las dos tarjetas: "Este correo tiene Beatcoins" y "Usar
 * mis Beatcoins".
 */
export default function BeatcoinsInfo({ earn }: { earn: number | null }) {
  return (
    <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
      {earn !== null && earn > 0 && (
        <>
          Con esta reserva sumas <span className="ds-mono text-[var(--gold)]">{formatCLP(earn)}</span> en Beatcoins.{" "}
        </>
      )}
      <strong className="font-medium text-[var(--text-secondary)]">Beatcoins</strong> es el programa de recompensas de
      FOTF Studios: te devolvemos el {Math.round(EARN_RATE * 100)}% de lo que pagas en dinero (1 Beatcoin = $1) para usar
      en tus próximas reservas y extras.{" "}
      <a
        href={BEATCOINS_TERMS_HREF}
        target="_blank"
        rel="noopener"
        className="whitespace-nowrap text-[var(--accent)] underline-offset-4 hover:underline"
      >
        Ver condiciones
      </a>
    </p>
  );
}
