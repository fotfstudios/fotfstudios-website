"use client";

/**
 * Último recurso: reemplaza el root layout completo, por eso define su propio
 * <html><body> y usa estilos inline (globals.css puede no estar disponible).
 * Solo visible en producción (en dev lo tapa el overlay de Next).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-CL">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          backgroundColor: "#0a0a0a",
          color: "#f5f2ec",
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: 0,
          }}
        >
          Algo salió mal
        </h1>
        <p style={{ color: "#b9b5ab", fontSize: "13px", maxWidth: "40ch", lineHeight: 1.6, margin: 0 }}>
          Tuvimos un problema inesperado. Intenta de nuevo.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            backgroundColor: "#e8c94a",
            color: "#0a0a0a",
            border: "none",
            padding: "12px 24px",
            fontFamily: "inherit",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
        {error.digest && <p style={{ color: "#6f6c64", fontSize: "10px", margin: 0 }}>Ref: {error.digest}</p>}
      </body>
    </html>
  );
}
