"use client";

import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * Boundary del panel: el shell (sidebar) queda vivo; solo cae el contenido del
 * segmento. Nunca muestra `error.message`; solo el `digest` como referencia.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon="alert"
        title="Algo falló en el panel"
        hint="Reintenta la operación. Si sigue pasando, revisa los logs del servidor."
        action={
          <button type="button" onClick={reset} className={btn("primary", "md")}>
            Reintentar
          </button>
        }
      />
      {error.digest && <p className="label-sm text-center text-bone-mute">Ref: {error.digest}</p>}
    </div>
  );
}
