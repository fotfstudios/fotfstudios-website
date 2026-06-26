import type { ReactNode } from "react";

/**
 * Cabecera de página: kicker mono + título display + una línea editorial (Fraunces)
 * opcional, con slot de acción primaria a la derecha. Híbrido editorial.
 */
export function PageHeader({
  kicker,
  title,
  editorial,
  action,
}: {
  kicker?: string;
  title: string;
  editorial?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
      <div>
        {kicker && <p className="label-sm text-gold">{kicker}</p>}
        <h1 className="font-display mt-2 text-bone" style={{ fontSize: "clamp(2rem,5vw,3.25rem)" }}>
          {title}
        </h1>
        {editorial && <p className="font-editorial mt-1 text-lg text-bone-dim">{editorial}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </header>
  );
}
