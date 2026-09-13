"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor de cabina: un punto + un aro que lo persigue con leve retardo.
 * Crece sobre elementos interactivos. Solo en punteros finos (desktop) y
 * cuando el usuario no pidió menos movimiento. mix-blend difference → siempre legible.
 *
 * El aro se anima con requestAnimationFrame solo mientras persigue al puntero: el loop
 * arranca en cada mousemove y se detiene al converger (antes corría a 60 fps para
 * siempre, con la pestaña quieta). El crecimiento sobre interactivos es `scale` en CSS
 * (compone con el translate inline y no toca layout).
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    document.documentElement.classList.add("has-cursor");

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0; // 0 = loop detenido
    let visible = false;

    // Un paso del aro hacia el puntero; se re-agenda solo si aún no llegó.
    const step = () => {
      const dx = mx - rx;
      const dy = my - ry;
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        rx = mx;
        ry = my;
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        raf = 0;
        return;
      }
      rx += dx * 0.18;
      ry += dy * 0.18;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
      // El punto sigue al instante; el aro con retardo (loop mientras persigue)
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      wake();
    };

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const interactive = t?.closest("a, button, [role='button'], input, textarea");
      ring.dataset.active = interactive ? "true" : "false";
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" style={{ opacity: 0 }} aria-hidden />
      <div ref={dotRef} className="cursor-dot" style={{ opacity: 0 }} aria-hidden />
    </>
  );
}
