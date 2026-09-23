/**
 * Nota al margen dentro de un artículo.
 *
 * `warn` usa GRAPHITE, no Sirena. Sirena es solo urgencia real (cierre de la sala, el
 * botón de envío de la guía); un recuadro de advertencia decorativo en Sirena la gasta y
 * deja de significar nada. lib/blog-contract.test.ts lo vigila.
 */
export function Callout({ tone = "note", children }: { tone?: "note" | "warn"; children: React.ReactNode }) {
  const note = tone === "note";
  return (
    <aside
      className={`mt-8 border-l-2 pl-5 ${note ? "border-gold/60" : "border-graphite"}`}
      role="note"
    >
      <p className={`label ${note ? "text-gold" : "text-bone-mute"}`}>{note ? "Nota" : "Ojo"}</p>
      <div className="mt-2 space-y-3 leading-relaxed text-bone-dim">{children}</div>
    </aside>
  );
}
