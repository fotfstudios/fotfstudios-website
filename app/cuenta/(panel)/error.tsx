"use client";

import { EmptyState } from "@/components/admin/ui/EmptyState";
import { btn } from "@/components/admin/ui/styles";

/**
 * Boundary del área de clientes: el shell queda vivo; solo cae el contenido.
 * Nunca muestra `error.message`; solo el `digest` como referencia.
 */
export default function CuentaError({
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
        title="Algo falló"
        hint="Reintenta. Si sigue pasando, escríbenos por WhatsApp y lo vemos."
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
