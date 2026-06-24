"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Única superficie donde se aplica el grade de marca → coherencia garantizada.
 * next/image con `fill` (no necesita dimensiones), object-cover, grade sutil,
 * scrim de protección opcional ("no foto sin scrim") y fade-in al cargar.
 */
export default function BrandImage({
  src,
  alt,
  priority = false,
  sizes = "100vw",
  scrim = "none",
  grain = false,
  className = "",
  imgClassName = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  scrim?: "none" | "bottom" | "left";
  grain?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const scrimClass = scrim === "bottom" ? "scrim-b" : scrim === "left" ? "scrim-l" : "";

  return (
    <div
      className={`relative overflow-hidden bg-ink-soft ${scrimClass} ${grain ? "grain" : ""} ${className}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onLoad={() => setLoaded(true)}
        data-loaded={loaded}
        className={`img-grade img-fade object-cover ${imgClassName}`}
      />
    </div>
  );
}
