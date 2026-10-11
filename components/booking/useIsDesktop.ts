"use client";

import { useEffect, useState } from "react";

/**
 * ¿El viewport cumple `query`? `null` hasta montar (SSR-safe: el primer render del
 * cliente coincide con el del servidor → sin hydration mismatch). Por defecto `64rem`
 * — el `lg` de Tailwind v4 — para no discrepar jamás de `lg:hidden` aunque el usuario
 * escale la fuente del navegador. Quien use otro corte (p. ej. el wizard de /reservar)
 * pasa la misma media query que usa en su CSS.
 */
export function useIsDesktop(query = "(min-width: 64rem)"): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return isDesktop;
}
