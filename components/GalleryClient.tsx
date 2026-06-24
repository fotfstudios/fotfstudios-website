"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/photos";
import BrandImage from "./BrandImage";

export default function GalleryClient({
  photos,
  featuredCount = photos.length,
}: {
  photos: Photo[];
  featuredCount?: number;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const hasMore = photos.length > featuredCount;
  const visible = expanded ? photos : photos.slice(0, featuredCount);
  const hiddenCount = photos.length - featuredCount;

  const close = useCallback(() => {
    setOpen(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      setOpen((i) => {
        if (i === null) return i;
        return (i + dir + photos.length) % photos.length;
      });
    },
    [photos.length]
  );

  // Teclado: Esc cierra, flechas navegan. Bloqueo de scroll + focus trap.
  useEffect(() => {
    if (open === null) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Tab") {
        // Focus trap dentro del diálogo
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, go]);

  const current = open !== null ? photos[open] : null;

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
        {visible.map((p, i) => (
          <button
            key={p.src}
            type="button"
            onClick={(e) => {
              triggerRef.current = e.currentTarget;
              setOpen(i);
            }}
            aria-label={`Ampliar foto: ${p.alt}`}
            className={`group relative block overflow-hidden border hairline transition-colors hover:border-gold focus-visible:border-gold focus-visible:outline-none ${
              // Primera foto más grande en desktop, ritmo de cabina
              i === 0 ? "col-span-2 row-span-2 md:col-span-2 md:row-span-2" : ""
            }`}
          >
            <BrandImage
              src={p.src}
              alt={p.alt}
              sizes="(max-width: 768px) 50vw, 33vw"
              className={i === 0 ? "aspect-square md:aspect-[4/3]" : "aspect-square"}
              imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center bg-ink/70 text-gold opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            >
              +
            </span>
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="group inline-flex items-center gap-3 border hairline px-7 py-4 label text-bone-dim transition-colors hover:border-gold hover:text-gold"
          >
            {expanded ? "Ver menos" : `Ver más fotos (${hiddenCount})`}
            <span className={`transition-transform ${expanded ? "-rotate-90" : "rotate-90"} group-hover:translate-x-0.5`}>
              →
            </span>
          </button>
        </div>
      )}

      {/* Lightbox — portal a <body> para escapar el stacking context del Reveal */}
      {current &&
        createPortal(
          <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          tabIndex={-1}
          className="fixed inset-0 z-[100] flex flex-col bg-ink/96 backdrop-blur-md outline-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Barra superior */}
          <div className="flex items-center justify-between px-5 py-4 md:px-8">
            <span className="label text-bone-mute">
              {String((open ?? 0) + 1).padStart(2, "0")}{" "}
              <span className="text-bone-mute/50">/ {String(photos.length).padStart(2, "0")}</span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar galería"
              className="flex h-10 w-10 items-center justify-center border hairline text-bone transition-colors hover:border-gold hover:text-gold"
            >
              <span aria-hidden className="text-xl leading-none">×</span>
            </button>
          </div>

          {/* Imagen */}
          <div className="relative flex flex-1 items-center justify-center px-4 pb-4 md:px-16">
            <div className="relative h-full w-full">
              <Image
                key={current.src}
                src={current.src}
                alt={current.alt}
                fill
                sizes="100vw"
                priority
                className="img-grade object-contain"
              />
            </div>

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Foto anterior"
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border hairline bg-ink/60 text-bone transition-colors hover:border-gold hover:text-gold md:left-5"
                >
                  <span aria-hidden>←</span>
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Foto siguiente"
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border hairline bg-ink/60 text-bone transition-colors hover:border-gold hover:text-gold md:right-5"
                >
                  <span aria-hidden>→</span>
                </button>
              </>
            )}
          </div>

          {/* Pie */}
          <p className="px-5 pb-6 text-center text-sm text-bone-dim md:px-8">{current.alt}</p>
          </div>,
          document.body
        )}
    </>
  );
}
