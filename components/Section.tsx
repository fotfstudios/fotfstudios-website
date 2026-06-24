import type { ReactNode } from "react";
import Reveal from "./Reveal";
import MaskText from "./MaskText";

/** Encabezado de sección: número · kicker + título display con revelado cinético. */
export function SectionHead({
  n,
  kicker,
  title,
  lines,
  className = "",
}: {
  n: string;
  kicker: string;
  /** Texto del título (una sola pieza). Usa `lines` para revelado por línea. */
  title?: ReactNode;
  /** Líneas del título para el revelado por máscara escalonado. */
  lines?: ReactNode[];
  className?: string;
}) {
  return (
    <div className={className}>
      <Reveal>
        <div className="flex items-center gap-4">
          <span className="label-sm text-gold">{n}</span>
          <span className="h-px flex-1 max-w-[60px] bg-[var(--color-ink-line)]" />
          <span className="label-sm text-bone-mute">{kicker}</span>
        </div>
      </Reveal>
      <MaskText
        as="h2"
        lines={lines ?? [title]}
        baseDelay={80}
        className="font-display mt-5 text-bone text-[clamp(2.4rem,6vw,4.5rem)]"
      />
    </div>
  );
}

export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto w-full max-w-[1280px] px-5 py-24 md:px-10 md:py-32 ${className}`}
    >
      {children}
    </section>
  );
}
