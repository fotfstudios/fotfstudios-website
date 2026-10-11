import type { ReactNode } from "react";

/** Cabecera de sección del checkout: número (solo escritorio), título en eyebrow y bajada. */
export default function SectionHead({
  id,
  n,
  title,
  aside,
  children,
}: {
  /** id del título, para `aria-labelledby` del grupo que encabeza. */
  id?: string;
  n?: string;
  title: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="flex items-baseline gap-3">
          {n && <span className="ds-mono text-xs text-[var(--accent)]">{n}</span>}
          <span className="ds-eyebrow text-[var(--text-muted)]">{title}</span>
        </h2>
        {aside}
      </div>
      {children && <p className="text-sm text-[var(--text-secondary)]">{children}</p>}
    </div>
  );
}
