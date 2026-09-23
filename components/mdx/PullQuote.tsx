/**
 * El ÚNICO momento Fraunces sancionado por artículo (una línea editorial por sección, y
 * un artículo es una sección larga). Más de uno por archivo lo advierte el registro.
 */
export function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <figure className="mt-10 border-t hairline pt-8">
      <blockquote className="font-editorial text-2xl leading-snug text-bone-dim">{children}</blockquote>
    </figure>
  );
}
