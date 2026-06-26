"use client";

import { type ReactNode, useEffect } from "react";
import { Icon } from "./icons";

/** Modal presentacional: scrim + foco, cierra con Escape o click afuera. */
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="booth-glow relative w-full max-w-md border hairline bg-ink">
        <div className="flex items-center justify-between border-b hairline px-5 py-3.5">
          <h3 className="label text-bone">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-bone-mute transition-colors hover:text-gold">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
