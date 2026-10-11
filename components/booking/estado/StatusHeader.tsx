import type { ReactNode } from "react";
import Badge from "@/components/ds/Badge";

/**
 * Cabecera de cada estado de /reserva/estado: insignia (con un check sólido cuando el pago
 * está confirmado), título display y bajada. El `role="status"` vive en el contenedor.
 */
export default function StatusHeader({
  badge,
  tone,
  confirmed = false,
  title,
  children,
}: {
  badge: string;
  tone: "live" | "gold" | "danger" | "neutral";
  confirmed?: boolean;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {confirmed && (
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        )}
        <Badge variant={tone} dot>
          {badge}
        </Badge>
      </div>
      <h1 className="ds-h2">{title}</h1>
      {children && <div className="max-w-[620px] text-[17px] leading-relaxed text-[var(--text-secondary)]">{children}</div>}
    </header>
  );
}
