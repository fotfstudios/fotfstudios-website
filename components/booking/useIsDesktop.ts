"use client";

import { useEffect, useState } from "react";

/**
 * ¿Viewport ≥ `lg`? `null` hasta montar (SSR-safe: el primer render del cliente
 * coincide con el del servidor → sin hydration mismatch). Usa `64rem` — el `lg`
 * por defecto de Tailwind v4 — para no discrepar jamás de `lg:hidden` aunque el
 * usuario escale la fuente del navegador.
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
