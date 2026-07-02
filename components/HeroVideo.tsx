"use client";

import { useEffect, useRef } from "react";

/**
 * Fondo de video del Hero: autoplay silenciado, en bucle, a sangre completa.
 *
 * No usa el atributo `autoPlay`; en su lugar llama `.play()` desde un efecto
 * solo cuando NO hay `prefers-reduced-motion` → quien pide menos movimiento ve
 * el `poster` estático y nada se reproduce (misma disciplina que ParallaxImage).
 * WebM primero (más liviano), MP4 como respaldo universal. El `poster` pinta al
 * instante (buen LCP) y da continuidad hasta que el video arranca.
 */
export default function HeroVideo({
  webm,
  mp4,
  poster,
  alt,
  className = "",
}: {
  webm: string;
  mp4: string;
  poster: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // solo poster
    v.play().catch(() => {}); // ignora el rechazo de autoplay
  }, []);

  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      preload="auto"
      aria-label={alt}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    >
      <source src={webm} type="video/webm" />
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
