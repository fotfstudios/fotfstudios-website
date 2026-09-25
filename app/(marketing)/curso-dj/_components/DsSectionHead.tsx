import type { ReactNode } from "react";

/** Eyebrow + H2 del sistema: el encabezado de todas las secciones. */
export default function DsSectionHead({
  eyebrow,
  title,
  eyebrowClass = "text-[var(--accent)]",
  id,
  children,
}: {
  eyebrow: string;
  title: string;
  eyebrowClass?: string;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className={`ds-eyebrow m-0 ${eyebrowClass}`}>{eyebrow}</p>
      <h2 id={id} className="ds-h2">
        {title}
      </h2>
      {children}
    </div>
  );
}
