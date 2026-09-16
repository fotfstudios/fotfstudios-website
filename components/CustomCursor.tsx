"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor de cabina: PLAY ▶ / PAUSE ❚❚ — las dos acciones más básicas de un DJ.
 *
 * Un solo glifo que sigue al puntero al instante (translate3d en cada mousemove; sin
 * loop de persecución, que es lo que se colgaba). Los estados son CSS puro:
 *   play   → por defecto: vas "reproduciendo" la página.
 *   pause  → sobre algo clickeable: un control, detente acá (crece 1.5×).
 *   hidden → sobre campos de texto: manda el I-beam nativo, no se dibujan dos cursores.
 * Al presionar, un pulso corto ("cue"). Solo punteros finos y sin prefers-reduced-motion;
 * mix-blend difference → legible sobre foto, sobre Ink y sobre la página Bone.
 *
 * Estructura: el wrapper SOLO se posiciona (transform inline); el crecimiento vive en
 * .cursor-glyph. Las propiedades individuales (`scale`) se aplican ANTES que `transform`,
 * así que un `scale` en el mismo elemento multiplica el translate y el cursor se va a
 * 1.5× las coordenadas del puntero — el "salto" del aro anterior (#146).
 */
const INTERACTIVE = "a, button, [role='button'], summary, label";
const TEXT_FIELDS = "input, textarea, select";

export default function CustomCursor() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    const el = ref.current;
    if (!el) return;

    document.documentElement.classList.add("has-cursor");
    const onMove = (e: MouseEvent) => {
      el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      if (el.dataset.visible !== "true") el.dataset.visible = "true";
    };

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(TEXT_FIELDS)) el.dataset.mode = "hidden";
      else if (t?.closest(INTERACTIVE)) el.dataset.mode = "pause";
      else el.dataset.mode = "play";
    };

    // Cue: el pulso se re-dispara aunque el click anterior aún esté animando.
    const onDown = () => {
      delete el.dataset.cue;
      void el.offsetWidth; // reinicia la animación
      el.dataset.cue = "true";
    };
    const onCueEnd = () => {
      delete el.dataset.cue;
    };

    const onLeave = () => {
      el.dataset.visible = "false";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });
    el.addEventListener("animationend", onCueEnd);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mousedown", onDown);
      el.removeEventListener("animationend", onCueEnd);
      document.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  return (
    <div ref={ref} className="cursor" data-mode="play" data-visible="false" aria-hidden>
      <div className="cursor-glyph">
        <svg className="cursor-play" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 1.5v13l11-6.5z" />
        </svg>
        <svg className="cursor-pause" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 2h3.6v12H3zM9.4 2H13v12H9.4z" />
        </svg>
      </div>
    </div>
  );
}
