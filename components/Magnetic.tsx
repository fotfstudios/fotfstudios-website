"use client";

import { useRef, type ReactNode } from "react";

/**
 * Atracción magnética sutil: el elemento se inclina hacia el cursor.
 * Movimiento contenido (sobrio, no juguetón). Se desactiva en táctil / menos movimiento.
 */
export default function Magnetic({
  children,
  strength = 0.28,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  const allowed = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !allowed()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate3d(0, 0, 0)";
  };

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className={`inline-flex will-change-transform ${className}`}
      style={{ transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1)" }}
    >
      {children}
    </span>
  );
}
