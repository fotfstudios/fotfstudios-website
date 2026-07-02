"use client";

import { Icon } from "./icons";
import { useToast } from "./Toaster";

/**
 * Botón para copiar un valor (id de MP, referencia, etc.) al portapapeles,
 * con feedback "Copiado" vía el Toaster del admin.
 */
export function CopyButton({ value, label = "Copiado" }: { value: string; label?: string }) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast({ tone: "ok", message: label });
    } catch {
      toast({ tone: "error", message: "No se pudo copiar" });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copiar"
      title="Copiar"
      className="text-bone-mute transition-colors hover:text-gold"
    >
      <Icon name="copy" size={14} />
    </button>
  );
}
