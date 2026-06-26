import type { ReactNode } from "react";

/** Contenedor con borde hairline. Header opcional (título + acción a la derecha). */
export function Card({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border hairline bg-ink/40 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b hairline px-5 py-3.5">
          {title && <h3 className="label text-bone-mute">{title}</h3>}
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
