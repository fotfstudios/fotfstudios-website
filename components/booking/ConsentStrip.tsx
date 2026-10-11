import Button from "@/components/ds/Button";
import { dsFonts } from "@/components/ds/fonts";
import "@/components/ds/ds.css";

/**
 * Consentimiento de cookies en la superficie de reservas: una sola línea con el design
 * system (el banner del resto del sitio ocupa media pantalla en un teléfono, justo sobre
 * el botón de pagar). La lógica (Consent Mode, localStorage) sigue en ConsentBanner.
 *
 * Se apoya sobre la barra fija del checkout móvil: `--fixed-bottom-offset` lo publica
 * esa barra con su alto (0 si no hay barra), así los dos quedan usables a la vez.
 */
export default function ConsentStrip({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className={`fotf-ds ${dsFonts} fixed inset-x-0 z-50 border-t border-[var(--border-subtle)] backdrop-blur`}
      // .fotf-ds fija su propio fondo (CSS sin capa): el translúcido va en línea.
      style={{ bottom: "var(--fixed-bottom-offset, 0px)", background: "rgba(10, 10, 10, 0.92)" }}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2 sm:px-10">
        {/* Una sola línea también en un teléfono: frase corta ahí y completa desde sm. El enlace
            a la política es la palabra "cookies" (sin "Más info" aparte). */}
        <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--text-secondary)]">
          <span className="sm:hidden">
            <a href="/privacidad" className="text-[var(--accent)] underline underline-offset-4">
              Cookies
            </a>{" "}
            de medición.
          </span>
          <span className="hidden sm:inline">
            Usamos{" "}
            <a href="/privacidad" className="text-[var(--accent)] underline underline-offset-4">
              cookies
            </a>{" "}
            para medir el tráfico y mejorar el sitio.
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={onReject}>
          Rechazar
        </Button>
        <Button size="sm" onClick={onAccept}>
          Aceptar
        </Button>
      </div>
    </div>
  );
}
