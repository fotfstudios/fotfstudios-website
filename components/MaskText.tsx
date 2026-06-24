"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Revelado cinético por máscara: cada línea sube desde detrás de un borde limpio,
 * con un leve escalonado. Es el "pulso" tipográfico de la marca.
 * Respeta prefers-reduced-motion (vía CSS) y revela de inmediato si así se pide.
 */
export default function MaskText({
  lines,
  as: Tag = "span",
  immediate = false,
  stagger = 90,
  baseDelay = 0,
  className = "",
}: {
  lines: ReactNode[];
  as?: ElementType;
  immediate?: boolean;
  stagger?: number;
  baseDelay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (immediate) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="mask-line" data-shown={shown}>
          <span
            className="mask-inner"
            style={{
              transitionDelay: `${baseDelay + i * stagger}ms`,
              opacity: shown ? 1 : 0,
            }}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
