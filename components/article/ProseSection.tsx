/**
 * Sección de prosa: la unidad de texto largo del sitio.
 *
 * Vivía duplicada BYTE POR BYTE en tres lugares: el Prose.tsx del grupo de artículos,
 * /privacidad y /terminos. Es la misma pieza en los tres: un hairline arriba, el
 * título en display y el cuerpo en bone-dim. Acá queda una sola copia.
 *
 * Los artículos en MDX NO la usan: su `h2` lleva estas mismas clases desde el mapeo
 * de components/mdx/. Esto es para TSX escrito a mano (legales, páginas de prosa).
 */
export function ProseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 border-t hairline pt-10">
      <h2 className="font-display text-bone" style={{ fontSize: "clamp(1.4rem,4vw,2rem)" }}>
        {title}
      </h2>
      <div className="mt-4 space-y-4 leading-relaxed text-bone-dim">{children}</div>
    </section>
  );
}
