"use client";

import Link from "next/link";

/**
 * Boundary de errores del sitio público (y de /admin/login, que vive fuera del
 * shell). Nunca muestra `error.message` (puede filtrar detalles del servidor);
 * solo el `digest` como referencia de soporte.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="label text-gold">Error</p>
      <h1 className="font-display mt-3 text-bone" style={{ fontSize: "clamp(2.4rem,7vw,4rem)" }}>
        Algo salió mal
      </h1>
      <p className="mt-4 max-w-sm leading-relaxed text-bone-dim">
        Tuvimos un problema al cargar esta página. Intenta de nuevo; si sigue pasando,
        escríbenos por WhatsApp.
      </p>
      <div className="mt-8 flex items-center gap-6">
        <button
          type="button"
          onClick={reset}
          className="label bg-gold px-6 py-3 text-ink transition-colors hover:bg-gold-deep"
        >
          Reintentar
        </button>
        <Link href="/" className="label-sm text-bone-mute transition-colors hover:text-gold">
          ← Volver al inicio
        </Link>
      </div>
      {error.digest && <p className="label-sm mt-10 text-bone-mute">Ref: {error.digest}</p>}
    </main>
  );
}
