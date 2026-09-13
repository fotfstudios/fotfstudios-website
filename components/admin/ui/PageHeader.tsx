import type { ReactNode } from "react";

/**
 * Cabecera de página: kicker mono + título display, con slot de acción primaria
 * a la derecha.
 */
export function PageHeader({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
      <div>
        {kicker && <p className="label-sm text-gold">{kicker}</p>}
        <h1 className="font-display mt-2 text-bone" style={{ fontSize: "clamp(2rem,5vw,3.25rem)" }}>
          {title}
        </h1>
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
