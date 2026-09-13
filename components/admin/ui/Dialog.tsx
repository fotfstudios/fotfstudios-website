"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "./icons";

/**
 * Modal sobre <dialog> nativo + showModal(): foco atrapado, fondo inerte, Escape y
 * foco restaurado al cerrar los pone el navegador — no se reimplementan. El padre lo
 * renderiza condicionalmente y recibe onClose: Escape llega como `cancel`, y un click
 * en el scrim (::backdrop) llega con el propio <dialog> como target porque el panel
 * interior cubre todo lo demás.
 */
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      // El padre desmonta el <dialog> aún abierto: el navegador solo restaura el foco
      // en close(), no al quitar el nodo, así que se cierra y se devuelve a mano.
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto border hairline bg-ink p-0 text-bone backdrop:bg-ink/80 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b hairline px-5 py-3.5">
        <h3 id={titleId} className="label text-bone">
          {title}
        </h3>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="-m-3 p-3 text-bone-quiet transition-colors hover:text-gold">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
