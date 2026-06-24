"use client";

import { useEffect, useRef } from "react";
import BrandImage from "./BrandImage";

/**
 * Parallax de cabina: la foto deriva con el cursor → profundidad.
 * `scale` da margen para que la traslación no descubra los bordes.
 * Se desactiva en táctil / menos movimiento.
 */
export default function ParallaxImage({
  src,
  alt,
  sizes = "100vw",
  priority = false,
  intensity = 48,
  scale = 1.16,
  imgClassName = "",
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  intensity?: number;
  scale?: number;
  imgClassName?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * intensity;
      ty = (e.clientY / window.innerHeight - 0.5) * intensity;
    };

    const loop = () => {
      cx += (tx - cx) * 0.09;
      cy += (ty - cy) * 0.09;
      el.style.transform = `scale(${scale}) translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, [intensity, scale]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={ref}
        className="absolute inset-0 will-change-transform"
        style={{ transform: `scale(${scale})` }}
      >
        <BrandImage
          src={src}
          alt={alt}
          sizes={sizes}
          priority={priority}
          className="h-full w-full"
          imgClassName={imgClassName}
        />
      </div>
    </div>
  );
}
